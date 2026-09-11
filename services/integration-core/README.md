# Integration Core

The Integration Core owns the canonical order model and reliable ingestion
workflow.

The current increment implements a currency-aware order aggregate, HTTP order
ingestion and retrieval, and transactional PostgreSQL persistence through Flyway
and jOOQ. A new order, its timeline event, and a versioned pending outbox event
are committed atomically. It includes automated tests, health checks, Swagger
UI, and committed OpenAPI files. Source-credential persistence and application
verification are implemented and connected through a jOOQ lookup adapter;
versioned pepper configuration and CDI composition are also implemented. Source
API-key authentication protects order ingestion, and the source identity is
derived from the stored credential rather than the request body. Order reads
are authenticated and constrained to that same source. A Kafka adapter publishes
structured outbox events and is verified against a real broker. Scheduled
workers dispatch bounded outbox batches and recover expired claims; message
consumption handles `OrderReceived.v1` idempotently, records processing
attempts, transitions valid orders to `READY`, and emits `OrderReady.v2`.
Read-only operator endpoints expose paginated summaries and order details with
line items, timeline entries, and processing attempts. An optional OpenSearch
projection provides availability-gated operator search, reconciliation, safe
full reindexing, and durable projection-progress reporting while PostgreSQL
remains authoritative. HTTP correlation IDs are returned on success and error
responses and are persisted with ingestion events.

The service persists a canonical payload fingerprint with each order. Reusing a
source identity returns `ALREADY_RECEIVED` for equivalent content and
`PAYLOAD_CONFLICT` when the payload differs.

## Architecture

The service uses a lightweight hexagonal architecture. Packages reflect actual
responsibilities rather than a fixed number of layers:

```text
dev.pietrorussod.integrationhub/
  api/                         HTTP resources and transport DTOs
    correlation/               request correlation boundary
    operator/                  operator read API
    security/                  source API-key HTTP boundary
  application/authentication/ source authentication use case and ports
  application/order/           use cases, commands, results, and outbound ports
  application/operator/        operator read models, use cases, and port
  application/outbox/          event claim use case, model, and persistence port
  application/processing/      order-processing use case, model, and ports
  application/search/          search, reconciliation, and reindex use cases
  domain/order/                entities, value objects, and business invariants
  infrastructure/persistence/  PostgreSQL adapters
    jooq/                       jOOQ repository and record mapping
  infrastructure/messaging/    Kafka publisher and consumer adapters
  infrastructure/observability/ operational metrics adapters
  infrastructure/provisioning/ source credential administrative CLI
  infrastructure/scheduling/   scheduled outbox dispatch adapter
  infrastructure/search/       OpenSearch index and projection adapters
  infrastructure/security/     credential MAC verification
```

Dependencies point inward:

```text
api ----------------> application ----------------> domain
infrastructure -----> application and domain
domain ------------> Kotlin and Java standard libraries only
```

The domain has no framework or transport dependencies. The application layer
defines the `OrderRepository` port; `JooqOrderRepository` implements it and owns
the transactional database operation. Domain and application tests remain
framework-free, while PostgreSQL behavior is covered by integration tests.

New packages and ports are introduced only for concrete boundaries. jOOQ sources
are generated under `target/generated-sources/jooq` and are not committed.

Significant choices and their alternatives are recorded in the repository
[architecture decision log](../../docs/decisions/README.md).

## Monetary policy

- Supported currencies: `EUR`, `GBP`, and `USD`.
- Unit prices carry their currency and support up to four fractional digits.
- Line amounts are `quantity * unitPrice`, rounded to the currency minor unit
  with `HALF_UP`.
- The order total is the sum of the rounded line amounts.
- The declared total must be non-negative, use the order currency, fit its minor
  unit, and equal the calculated total.
- Calculated amounts are persisted and revalidated when restored.
- Orders remain in their original currency; there is no FX conversion.

## Payload fingerprinting

Version 1 hashes validated order content with SHA-256. It includes currency,
calculated total, item count, and each item's external line ID, SKU, description,
quantity, and unit price in meaningful order. Source identity, internal IDs,
status, and server-generated timestamps are excluded.

The binary representation has a fixed field order, embeds its version, uses
length-prefixed UTF-8 strings, marks nullable values explicitly, and normalizes
decimals. A golden-hash test guards against accidental format changes.

## Event persistence

A first ingestion stores one `ORDER_RECEIVED` timeline entry and one pending
`OrderReceived` version 1 outbox event. Equivalent or conflicting replays do not
create additional events. PostgreSQL integration tests verify atomic rollback
when the outbox insert fails. See the repository
[relational data model](../../docs/data-model.md) for the implemented tables and
relationships and the
[ingestion sequence diagrams](../../docs/ingestion-sequences.md) for the runtime
flow.

## Outbox claiming

`v0.2.0` implements the reliable publisher boundary: a worker can
atomically claim a bounded batch of due `PENDING` events. PostgreSQL row locks
with `SKIP LOCKED` give concurrent workers disjoint batches, and the short claim
transaction commits before any future broker call. A successful claim changes
the event to `PUBLISHING`, records worker, claim time, and a random fencing token,
and increments the publication attempt count. Completion and retry require the
exact token, preventing a late result from an older attempt from updating a
newer claim. Recovery independently returns expired claims to `PENDING`. A
permanent or exhausted failure records safe diagnostics and moves the exact
claim to terminal `FAILED` state.

The Kafka adapter maps a claimed event to a structured JSON envelope, derives
the aggregate key and routing headers, and waits for broker acknowledgement. CDI
connects the batch dispatcher to the publisher and a configurable retry policy.
A lightweight scheduler requests five events every second and skips overlapping
runs within one service instance. `OUTBOX_WORKER_ID` can identify the running
instance and defaults to `integration-core`; production deployments should
provide an instance-specific value. A separate job runs every 30 seconds and
recovers up to 100 claims older than two minutes. The claim timeout exceeds the
five-event batch's 60-second publication timeout budget.
See the [outbox lifecycle diagrams](../../docs/outbox-lifecycle.md) for the
runtime map, class call trees, implemented transitions, bounded retry policy,
and at-least-once failure case.

## Kafka publication

`OrderReceived` version 1 is published to `integration.order.received.v1`. The
JSON value is authoritative, the Kafka key is `aggregateId`, and headers expose
the stable event ID, event type and version, correlation ID, and content type.
Worker identity, fencing tokens, and attempt counts remain internal.

The producer uses `acks=all` and Kafka idempotence. This reduces duplicates from
producer retries but does not make the database-to-broker boundary exactly once:
a process can stop after broker acknowledgement and before marking the outbox
row `PUBLISHED`. Consumers must deduplicate by stable event ID.

Timeouts form an intentional hierarchy: an individual Kafka request has 8
seconds, Kafka delivery has 10 seconds, and the adapter waits at most 12 seconds.
The outer timeout must remain greater than the producer delivery timeout.

Fast component integration tests replace the connector with SmallRye in-memory.
Broker-backed integration tests enable Kafka Dev Services and use Redpanda to
verify publication metadata, consumer retry and dead-letter behavior, and the
complete path from authenticated HTTP ingestion to `OrderReady.v2` publication.
Production obtains its broker address from `KAFKA_BOOTSTRAP_SERVERS`.

## Order search projection

The optional OpenSearch path consumes `OrderReady.v2`, writes versioned order
documents behind the `orders-read` alias, and ignores equal or stale aggregate
versions. Operator search is unavailable until that alias exists. PostgreSQL is
the source of truth: a leased reconciliation job repairs missed documents, and
the internal full-reindex use case builds and validates a candidate index before
an atomic alias cutover. Starting a reindex is intentionally not exposed as an
operator command until authentication and audit controls exist.

The search profile, its local startup command, and the status endpoint are
documented in the repository [local demo](../../README.md#local-demo). The
design and cutover decisions are recorded in
[ADR 0015](../../docs/decisions/0015-rebuildable-opensearch-order-projection.md)
and [ADR 0018](../../docs/decisions/0018-safe-opensearch-reindex-cutover.md).

## Observability

Prometheus metrics are exposed at `/metrics`. The service reports cumulative
outbox dispatch outcomes under `integration_hub_outbox_dispatch_events_total`,
using the bounded `outcome` values `claimed`, `published`, `rescheduled`,
`failed`, and `claim_lost`. Recovered expired claims are counted by
`integration_hub_outbox_recovery_events_total`. Quarkus also records execution
counts and durations for both scheduled jobs under `scheduled_methods_seconds`.
Search metrics report projection outcomes, reconciliation runs and documents,
reindex progress, the latest successful processing delay, and watermark age.

Readiness checks the PostgreSQL connection and outgoing messaging channel;
liveness reports whether the running process can continue serving. These
signals complement each other: health indicates whether the instance should
receive work, while metrics show how that work behaves over time.

## Prerequisites

- Java 25 or newer
- Docker with the Compose plugin for development, integration tests, and the
  local demo

## Source credential peppers

Source credential peppers are supplied through
`INTEGRATION_HUB_SECURITY_SOURCE_CREDENTIAL_PEPPERS` as comma-separated
`<version>:<pepper>` entries. Each pepper is at least 32 random bytes encoded as
canonical unpadded Base64URL. For example, generate a local version 1 pepper
without writing it to the repository:

```bash
PEPPER="$(openssl rand -base64 32 | tr '/+' '_-' | tr -d '=')"
export INTEGRATION_HUB_SECURITY_SOURCE_CREDENTIAL_PEPPERS="1:$PEPPER"
```

An empty configuration allows the service to start, but a stored credential
referencing an absent version produces an operational error when used.
Production deployments must inject peppers through their secret-management
boundary rather than repository configuration. Order ingestion expects the
credential in the `X-Source-API-Key` header.

## Operator authorization

Operator endpoints support external OIDC bearer-token validation. Enable both
`OPERATOR_OIDC_ENABLED` and `OPERATOR_AUTHORIZATION_ENABLED`, then configure
`OPERATOR_OIDC_AUTH_SERVER_URL`, `OPERATOR_OIDC_ISSUER`, and
`OPERATOR_OIDC_AUDIENCE` for the selected identity provider. Tokens must be
signed with `RS256`, match the configured issuer and audience, and contain
either `operator` or `platform-admin` in the `groups` claim. The default local
demo leaves this boundary disabled until the console can supply a token.

The service is a resource server: it validates access tokens through the
provider's JWKS endpoint but does not implement login, issue tokens, or manage
users and roles. Integration tests use an HTTP JWKS fixture and cover missing
credentials, insufficient roles, valid roles, issuer mismatch, audience
mismatch, and token expiry.

The committed OpenAPI contract identifies operator operations with the
`operatorJwt` bearer scheme while canonical source operations retain their
separate `sourceApiKey` scheme.

After Flyway has initialized the target database, provision a source credential
with the administrative CLI:

```bash
export DB_JDBC_URL="jdbc:postgresql://localhost:5432/integration_hub"
export DB_USERNAME="integration_hub"
export DB_PASSWORD="change-me"
export INTEGRATION_HUB_SECURITY_SOURCE_CREDENTIAL_PEPPERS="1:$PEPPER"

./mvnw compile exec:java@source-credentials \
  -Dexec.args="provision MARKETPLACE_A 1"
```

The command prints the complete API key once and stores only its HMAC. To rotate
a credential, provision the replacement, update the source client, and then
revoke the previous key ID:

```bash
./mvnw compile exec:java@source-credentials \
  -Dexec.args="revoke <key-id>"
```

The overlap between provisioning and revocation is intentional: it permits a
client migration without downtime. When rotating the pepper too, configure both
pepper versions in the service before provisioning against the new version.
Remove the old pepper only after every credential that references it has been
revoked. Do not pass production peppers or API keys as command-line arguments,
commit them, or retain them in terminal transcripts.

## Correlation IDs

Clients may send a canonical UUID in `X-Correlation-ID`. The service preserves a
valid value; a missing, malformed, or non-canonical value is replaced with a new
UUID rather than propagated. Every JAX-RS response includes the effective
correlation ID, including authentication, validation, and unsupported-media-type
errors.

Order ingestion passes the effective ID explicitly into the application command
and persists it on the atomic timeline and outbox records. The request filter
also exposes it through the logging MDC. Each completed application API request
records the method, path, status, and duration without query parameters or
request content. Quarkus-managed operational endpoints such as `/health` do not
pass through this JAX-RS filter. The MDC is cleared after the response to prevent
context leaking between requests.

Development and test profiles use human-readable logs with the complete MDC.
Production emits JSON, making the value searchable as `mdc.correlationId` in log
platforms. W3C trace-context propagation belongs to a later observability
increment; the repository correlation ID is already carried in event envelopes
and Kafka headers.

## Build

Run the fast, framework-free unit tests:

```bash
./mvnw test
```

Run the complete build, including `*IT` tests with Quarkus and PostgreSQL:

```bash
./mvnw verify
```

The combined unit and integration test coverage report is generated at
`target/site/jacoco/index.html`. jOOQ-generated classes are excluded; no coverage
threshold is enforced yet. CI uploads the same report as the
`integration-core-coverage` artifact on the
[GitHub Actions run](https://github.com/PietroRussoD/commerce-integration-hub/actions/workflows/ci.yml).

A software bill of materials (SBOM) is a machine-readable inventory of an
application's direct and transitive components. CycloneDX defines the inventory
format; vulnerability scanners can consume it, but generating an SBOM is not
itself a security scan and does not affect the running application.

Every `package` or `verify` build generates a CycloneDX 1.6 JSON SBOM at
`target/sbom/integration-core.cdx.json`. It includes compile and runtime
dependencies but excludes test and provided dependencies. CI uploads it as the
`integration-core-sbom` artifact with 14-day retention; generated SBOMs are not
committed.

Inspect the generated inventory locally with:

```bash
jq . target/sbom/integration-core.cdx.json
```

In GitHub, open a completed CI workflow run and download
`integration-core-sbom` from its **Artifacts** section.

Use `clean verify` to regenerate jOOQ sources and the committed OpenAPI files:

```bash
./mvnw clean verify
```

Generated OpenAPI files:

- [OpenAPI YAML](src/main/resources/META-INF/integration-core.yaml)
- [OpenAPI JSON](src/main/resources/META-INF/integration-core.json)

jOOQ derives Kotlin table and record classes from the ordered Flyway migrations
under `src/main/resources/db/migration`.

## Run

```bash
./mvnw quarkus:dev
```

Runtime API documentation:

```text
http://localhost:8080/openapi/integration-core
http://localhost:8080/openapi-ui/integration-core/
```

Operational endpoints:

```text
http://localhost:8080/health
http://localhost:8080/health/live
http://localhost:8080/health/ready
http://localhost:8080/metrics
```

## Local demo

From the repository root, build the service and wait for PostgreSQL, Redpanda,
and the Integration Core to become healthy. The one-shot `redpanda-init`
service creates the three-partition `OrderReceived`, `OrderReady`, and
dead-letter topics and exits successfully:

```bash
cd services/integration-core
./mvnw package -DskipTests
cd ../..
docker compose up --build --wait
docker compose ps --all
```

PostgreSQL, Redpanda, and Integration Core must report `healthy`, Redpanda
Console must be running, and `redpanda-init` must report `Exited (0)` before
continuing.

Provision a credential using the same local-only database credentials and
pepper configured in `compose.yaml`:

```bash
cd services/integration-core
export DB_JDBC_URL="jdbc:postgresql://localhost:5433/integration_hub"
export DB_USERNAME="integration_hub"
export DB_PASSWORD="local-development-only"
export INTEGRATION_HUB_SECURITY_SOURCE_CREDENTIAL_PEPPERS="1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

./mvnw compile exec:java@source-credentials \
  -Dexec.args="provision MARKETPLACE_A 1"
```

Copy the one-time `apiKey` value printed by the command and submit the example
order from the repository root:

```bash
export SOURCE_API_KEY="<generated-api-key>"
cd ../..

curl --include \
  --header "Content-Type: application/json" \
  --header "X-Source-API-Key: $SOURCE_API_KEY" \
  --data @examples/orders/marketplace-a-order.json \
  http://localhost:8080/api/v1/orders
```

On a clean database, the first submission returns `201 Created`. Repeating the
same command returns `200 OK` and the same canonical order because the payload
is equivalent. Submit the conflicting example, which preserves `externalId` but
changes the description:

```bash
curl --include \
  --header "Content-Type: application/json" \
  --header "X-Source-API-Key: $SOURCE_API_KEY" \
  --data @examples/orders/marketplace-a-order-conflict.json \
  http://localhost:8080/api/v1/orders
```

The service returns `409 Conflict` without a partial write.

Inspect the published event from the local broker:

```bash
docker compose exec -T redpanda \
  rpk topic consume integration.order.received.v1 \
  --brokers redpanda:9092 \
  --offset start \
  --num 1 \
  --format json
```

On a clean broker this returns the first submitted order as a structured
`OrderReceived.v1` event, together with its Kafka key, headers, partition, and
offset. The consumer processes it transactionally and the outbox dispatcher
publishes the resulting `OrderReady.v2` event to its dedicated topic:

```bash
docker compose exec -T redpanda \
  rpk topic consume integration.order.ready.v2 \
  --brokers redpanda:9092 \
  --offset start \
  --num 1 \
  --format json
```

Inspect health and operational metrics with:

```bash
curl http://localhost:8080/health/ready
curl http://localhost:8080/metrics
```

Stop the services while retaining PostgreSQL and Redpanda data with
`docker compose down`. Use `docker compose down --volumes` when a clean demo
database and broker are required.

## Container Image

Build the Quarkus application first:

```bash
./mvnw clean verify
```

Build the JVM container image:

```bash
docker build \
  -f src/main/docker/Dockerfile.jvm \
  -t commerce-integration-hub/integration-core:dev \
  .
```

The `Container security` workflow scans the published `latest` image every
Monday and on demand. It fails on any `HIGH` or `CRITICAL` operating-system or
application-library vulnerability. Run the equivalent check locally with
Docker:

```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:0.74.0 image \
  --scanners vuln \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  commerce-integration-hub/integration-core:dev
```

Run it locally:

```bash
docker run --rm \
  --name integration-core \
  -p 8080:8080 \
  -e DB_JDBC_URL=jdbc:postgresql://host.docker.internal:5432/integration_hub \
  -e DB_USERNAME=integration_hub \
  -e DB_PASSWORD=change-me \
  commerce-integration-hub/integration-core:dev
```

The production profile requires an accessible PostgreSQL database through
`DB_JDBC_URL`, `DB_USERNAME`, and `DB_PASSWORD`. Development mode and tests use
a PostgreSQL Dev Service managed by Quarkus.

CI publishes images to GitHub Container Registry:

```text
ghcr.io/pietrorussod/commerce-integration-hub/integration-core:latest
ghcr.io/pietrorussod/commerce-integration-hub/integration-core:v<version>
```

Publishing rules:

- pull requests build the image but do not push it;
- pushes to `main` publish `latest`;
- Git tags matching `v*` promote the existing `latest` image to the
  corresponding version tag without rebuilding it;
- promotion fails if the image has no OCI source revision or its revision is
  not an ancestor of the tagged commit.

## Format

```bash
./mvnw spotless:apply
```
