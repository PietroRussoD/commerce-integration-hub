# Connector Gateway

Provider-facing Node.js and TypeScript service for the Commerce Integration Hub.

Current implemented scope:

- health endpoint and graceful process lifecycle;
- strict `MARKETPLACE_A` raw-body authentication with timestamp freshness and
  bounded current/previous key rotation;
- connector-scoped 1 MiB raw JSON parsing, strict provider validation, generic
  `401`/`400`/`422` Problem Details responses, and exact canonical mapping;
- readonly receipt-command creation with the validated provider JSON, mapping
  version, canonical order, and raw-byte SHA-256 fingerprint;
- a connector-bound receipt use case and repository port with atomic
  `CREATED`, `EQUIVALENT_REPLAY`, and `PAYLOAD_CONFLICT` outcomes;
- a Kysely-managed PostgreSQL delivery-ledger schema with database constraints
  and a real PostgreSQL migration test;
- a transactional Kysely repository that atomically classifies first receipt,
  equivalent replay, and conflicting payload while preserving the first
  delivery identity and content under concurrent requests;
- production composition of webhook authentication, canonical mapping, receipt
  use case, repository, and database lifecycle;
- a bounded delivery-claim use case and Kysely adapter using oldest-first
  eligibility, `SKIP LOCKED`, short leases, and UUID fencing tokens;
- an Integration Core HTTP client behind an application port, with bounded
  configuration, timeout and cancellation handling, manual redirects, validated
  success responses, and typed delivery outcomes;
- a constrained PostgreSQL `delivery_attempts` schema with per-delivery attempt
  numbering and coherent open and completed evidence;
- an atomic fenced attempt-start use case and Kysely adapter that increment the
  delivery count and insert open attempt evidence in one transaction;
- an aligned delivery-state vocabulary with database-enforced active,
  forwarding, and terminal lease/completion invariants;
- atomic fenced `DELIVERED` completion for the current open attempt and delivery,
  including measured duration and Integration Core response identity;
- bounded equal-jitter retry scheduling and terminal exhaustion, persisted with
  attempt completion and lease release in one fenced transaction;
- fenced permanent-failure and blocked-configuration completion, including
  non-destructive connector blocking after core authentication rejection;
- bounded expired-lease recovery that preserves pre-attempt counts, closes
  abandoned open attempts, reuses the retry policy, and fences concurrent repair;
- an application batch worker that composes claim, fenced attempt start,
  Integration Core forwarding, and every persisted completion outcome;
- an opt-in non-overlapping runtime scheduler with recovery-first cycles,
  activity summaries, failure isolation, and graceful cancellation;
- a Prometheus `/metrics` endpoint with Node.js runtime and bounded-cardinality
  worker cycle, duration, delivery-outcome, and recovery metrics;
- a strict `ERP_B` page contract, canonical mapper, deterministic item
  fingerprint, poison-item classification, and atomic page/checkpoint commit;
- a fenced polling-lease lifecycle covering exclusive acquisition, renewal,
  clean release, expiry recovery, and concurrent ownership;
- a bounded `ERP_B` HTTP adapter with bearer authentication, opaque cursor
  encoding, timeout and cancellation, manual redirects, streamed response-size
  enforcement, strict page parsing, and typed failure classification;
- a single-page application use case that composes the provider adapter,
  classification, poison-item handling, and fenced atomic checkpoint commit
  without hiding retry or lease policy inside the page boundary;
- a bounded multi-page runner that acquires exclusive ownership, aggregates
  committed progress, renews between pages, stops at a configured page limit,
  preserves typed failures, and releases ownership in `finally`;
- fenced connector blocking after an `ERP_B` authentication rejection, so a
  stale poller cannot disable the connector and later runs stop at acquisition;
- opt-in bounded polling configuration and a non-overlapping scheduler with
  immediate execution, post-completion intervals, typed activity logging,
  cancellation-aware shutdown, and restart-safe lifecycle;
- zero-initialized, bounded-cardinality ERP_B run, duration, activity, progress,
  and last-success metrics exposed through the existing `/metrics` endpoint.
- read-only operator delivery list/detail endpoints with bounded filters,
  microsecond-safe opaque cursor pagination, payload-free summaries, and safe
  attempt history;
- an opt-in `platform-admin` delivery replay command with mandatory rationale,
  UUID idempotency key, immutable audit evidence, and a state-guarded
  PostgreSQL transition;
- opt-in `RS256` operator JWT validation through a remote JWKS, with issuer,
  audience, expiry, subject, `groups` roles, and distinct `401`, `403`, and `503`
  handling.

The running provider route returns `202` only after PostgreSQL commit. An
equivalent replay returns the same delivery ID with `Idempotent-Replay: true`;
conflicting bytes for the same provider event return `409`. The opt-in runtime
worker composes claiming, attempt start, Integration Core forwarding, persisted
success, retry, exhaustion, permanent failure, configuration blocking, and
expired-lease recovery. Unit, PostgreSQL integration, and complete worker
process tests verify those boundaries.

The `ERP_B` HTTP adapter, page processor, bounded runner, persistence boundaries,
configuration reader, scheduler, metrics, and `main.ts` composition are
implemented. Polling remains disabled by default; when disabled, its exposed
metrics remain zero and provider credentials are not read. A PostgreSQL-backed
process test verifies two provider pages, cursor progression, durable valid and
poison outcomes, metrics, lease release, and graceful shutdown. The client accepts
`ERP_B_BASE_URL`, `ERP_B_API_TOKEN`, and these optional bounds:

| Variable | Default | Range |
| --- | ---: | ---: |
| `ERP_B_PAGE_LIMIT` | `100` | `1..100` |
| `ERP_B_TIMEOUT_MILLISECONDS` | `5000` | `100..30000` |
| `ERP_B_MAX_RESPONSE_BYTES` | `8388608` | `1024..33554432` |
| `ERP_B_RETRY_AFTER_CAP_MILLISECONDS` | `900000` | `0..3600000` |

The polling scheduler is disabled unless `ERP_B_POLLING_ENABLED=true`. Its
configuration is:

| Variable | Default | Range or requirement |
| --- | --- | --- |
| `ERP_B_CONNECTOR_ID` | seeded ERP_B connector ID | canonical UUID |
| `ERP_B_POLLING_WORKER_ID` | none | required when enabled; 1..100 characters |
| `ERP_B_POLLING_INTERVAL_MILLISECONDS` | `30000` | `100..300000` |
| `ERP_B_POLLING_LEASE_DURATION_MILLISECONDS` | `60000` | `1000..300000` |
| `ERP_B_POLLING_MAX_PAGES_PER_RUN` | `10` | `1..100` |

Lease duration must leave at least five seconds beyond the configured provider
timeout. Compose supplies local-only values and keeps polling disabled by
default.

The token is sent only as an `Authorization: Bearer` header and is never part of
the request URL, a result object, or persisted provider evidence.

The runtime and framework boundary are documented in
[ADR 0010](../../docs/decisions/0010-node-typescript-fastify-gateway.md).
The forwarding boundary and response policy are recorded in
[ADR 0013](../../docs/decisions/0013-classify-integration-core-http-outcomes.md).

## OpenAPI

The Gateway exposes a generated OpenAPI document at
`GET /openapi.json`. It is built from the Fastify route schemas at application
startup and currently describes the health endpoints and the provider webhook
when that boundary is configured, plus the operator delivery inspection and
replay API.
The committed export and CI drift check are maintained with
`pnpm generate:openapi` and `pnpm check:openapi`.

## Operator delivery inspection

`GET /api/v1/operator/deliveries` returns newest-first delivery summaries. It
accepts `limit` (`1..100`), one `provider`, one `status`, and the opaque `cursor`
returned by the previous page. `GET /api/v1/operator/deliveries/{deliveryId}`
adds safe connector state, payload-retention metadata, and ordered attempt
evidence. Neither endpoint returns raw/canonical payloads, payload hashes,
leases, tokens, or connector secret references.

`POST /api/v1/operator/deliveries/{deliveryId}/replay` is registered only when
operator authorization is enabled. It requires a `platform-admin` JWT, a JSON
body with a non-blank `reason`, and an `Idempotency-Key` header containing a
UUID. It accepts only a durable `EXHAUSTED` delivery with an active connector
and unexpired canonical payload. The response is `202` when accepted and `409`
for an idempotency conflict or a state/payload/configuration rejection. The
command does not expose payload contents and preserves prior attempt evidence.

Payload retention has an expiry timestamp, a schema for atomic terminal
clearing with `payload_cleared_at`, and a PostgreSQL-tested application batch
bounded to 1–100 deliveries. It uses one database cutoff and `SKIP LOCKED`,
preserves ledger/history and receipt deduplication, and is safe to repeat.
PostgreSQL tests cover both cleanup/replay lock orders, expired replay waiting
for a row lock, accepted replay crossing expiry, claim during cleanup, and two
cleanup batches skipping locked work. The replay decision clock is sampled
after the row lock. The runtime includes an opt-in scheduler that runs one
batch immediately after startup and schedules the next only after completion.
Shutdown cancels future cycles and waits for the active atomic SQL batch before
closing the pool. Failure is counted and retried next interval with a generic
log message, without database error details or payloads.
[ADR 0024](../../docs/decisions/0024-terminal-gateway-payload-retention.md)
keeps raw and canonical payloads for active deliveries beyond expiry and permits
clearing only after a terminal outcome. This is not a universal 30-day maximum.
Migrations 010/011 clear no existing content. Migration 011 adds the partial
expiry/ID index with a regular index build; schema rollback of 010 fails after
clearance because the original payloads cannot be reconstructed.

| Variable | Default | Range |
| --- | ---: | --- |
| `PAYLOAD_RETENTION_ENABLED` | `false` | `true` or `false` |
| `PAYLOAD_RETENTION_BATCH_SIZE` | `50` | `1..100` |
| `PAYLOAD_RETENTION_INTERVAL_MILLISECONDS` | `60000` | `100..86400000` |

Each enabled replica can run cleanup; database row locks prevent duplicate
clearing. The interval is the delay after a batch settles, not an erasure
deadline. An existing terminal backlog is immediately eligible on enablement;
active work can retain content indefinitely until it becomes terminal.
Graceful stop waits for the database, within the deployment's termination grace
period. Disable retention to stop future clearing; this does not restore data.

Enable it explicitly in the local demo:

```bash
CONNECTOR_GATEWAY_PAYLOAD_RETENTION_ENABLED=true \
  docker compose --profile gateway up --build -d connector-gateway
```

Compose also accepts `CONNECTOR_GATEWAY_PAYLOAD_RETENTION_BATCH_SIZE` and
`CONNECTOR_GATEWAY_PAYLOAD_RETENTION_INTERVAL_MILLISECONDS`. Helm exposes the
same three settings under `connectorGateway.payloadRetention`, disabled by
default. The existing inspection API returns `payloadRetained=false` after
clearing; the Console already handles that state without additional fields.

The local demo keeps authorization disabled because the repository does not
include an identity provider or token issuer. Enable the Gateway resource-server
boundary with:

| Variable | Requirement |
| --- | --- |
| `OPERATOR_OIDC_ENABLED` | `true` to load OIDC/JWKS settings |
| `OPERATOR_AUTHORIZATION_ENABLED` | `true` to enforce route roles; requires OIDC |
| `OPERATOR_OIDC_ISSUER` | exact trusted token issuer URL |
| `OPERATOR_OIDC_AUDIENCE` | expected access-token audience |
| `OPERATOR_OIDC_JWKS_URL` | trusted HTTP(S) JWKS URL |
| `OPERATOR_OIDC_CLOCK_SKEW_SECONDS` | optional `0..300`, default `30` |

Only `RS256` is accepted. Read endpoints admit `operator` and
`platform-admin` values from the JWT `groups` claim; replay admits only
`platform-admin`. The Gateway validates
externally issued tokens but does not implement login, token issuance, user
storage, or role management.

The canonical Kafka event contract is documented separately in the repository
[AsyncAPI contract](../../docs/contracts/commerce-events.asyncapi.yaml).

## Requirements

- Node.js 24 or newer, below Node.js 27;
- pnpm 11.23.0;
- Docker for the PostgreSQL integration test.

## Validate

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:integration
```

Unit tests and coverage stay fast and container-free. `test:integration`
starts PostgreSQL 18.3 with Testcontainers and verifies migrations, critical
constraints, repositories, durable receipt, and the complete worker process from
a signed webhook to the Integration Core HTTP boundary and persisted completion.
It also runs the complete ERP_B polling process against a local synthetic HTTP
provider and verifies operator list, detail, and replay against PostgreSQL using
short-lived RS256 tokens and a test-only HTTP JWKS server.
The retention process test verifies disabled cleanup, terminal backlog clearing,
expired active forwarding, disabled-connector protection, replay idempotency
after clearing, restart, metrics, and shutdown with an active SQL batch held at
a controlled database barrier.

## Database migration

The gateway owns its schema and must not read Integration Core tables. Apply
all pending Kysely migrations against its dedicated local database while
running from source with:

```bash
docker compose --profile gateway up -d connector-gateway-postgres

DATABASE_URL=postgresql://connector_gateway:local-development-only@localhost:5434/connector_gateway \
  pnpm db:migrate
```

`DATABASE_MAX_POOL_SIZE` is optional and defaults to `10`. The initial schema
is shown in the repository [data model](../../docs/data-model.md), while
[ADR 0011](../../docs/decisions/0011-gateway-postgresql-kysely-persistence.md)
records the persistence decision.

## Run

From the repository root, build and run the containerized Gateway with its
dedicated PostgreSQL database and one-shot migration job:

```bash
docker compose --profile gateway up --build --wait connector-gateway
```

The migration job must complete successfully before the Gateway starts. It is
safe to run again because Kysely records applied migrations. The committed
Compose configuration uses local-only credentials and keeps forwarding and
polling disabled until explicitly enabled.

```mermaid
flowchart LR
    Provider[Marketplace A]
    Erp[ERP_B provider simulator]
    Gateway[Connector Gateway]
    Migration[One-shot migration job]
    Database[(Gateway PostgreSQL)]
    Core[Integration Core]
    Probe[Compose healthcheck]

    Provider -->|Signed webhook| Gateway
    Erp -->|Cursor pages| Gateway
    Migration -->|Apply pending schema| Database
    Gateway -->|Receipt and delivery state| Database
    Probe -->|GET /health/ready| Gateway
    Gateway -.->|Workers disabled by default| Core
```

Stop the persistent services without deleting their database volume with:

```bash
docker compose --profile gateway stop connector-gateway provider-simulator connector-gateway-postgres
```

### ERP_B polling demo

The `gateway` profile starts the deterministic provider simulator on
[http://localhost:8083](http://localhost:8083). Enable polling with:

```bash
CONNECTOR_GATEWAY_ERP_B_POLLING_ENABLED=true \
  docker compose --profile gateway up --build --wait connector-gateway
```

The first run requests two pages and stores two forwardable deliveries plus one
`ERP_B_UNSUPPORTED_CURRENCY` poison record. Inspect polling metrics at
[http://localhost:8081/metrics](http://localhost:8081/metrics). The simulator is
a local test tool; it is not included in either production service image. The
complete cursor, lease, classification, and atomic-commit flow is shown in the
[`ERP_B` polling diagrams](../../docs/erp-b-polling.md).

To exercise forwarding, first start Integration Core and provision a local
`MARKETPLACE_A` source credential using its
[local demo](../integration-core/README.md#local-demo). Keep the one-time API
key outside the repository, then recreate the Gateway with its worker enabled:

```bash
export INTEGRATION_CORE_SOURCE_API_KEY="<generated-api-key>"

CONNECTOR_GATEWAY_DELIVERY_WORKER_ENABLED=true \
  docker compose --profile gateway up --build --wait connector-gateway
```

Compose passes the credential only through the Gateway process environment.
The committed default remains `false`, so starting the Gateway without a source
credential still supports durable webhook receipt without forwarding.

To run the process directly for development instead, start PostgreSQL, apply
the migrations, and launch the TypeScript watcher:

```bash
docker compose --profile gateway up -d connector-gateway-postgres

DATABASE_URL=postgresql://connector_gateway:local-development-only@localhost:5434/connector_gateway \
  pnpm db:migrate

DATABASE_URL=postgresql://connector_gateway:local-development-only@localhost:5434/connector_gateway \
MARKETPLACE_A_WEBHOOK_CURRENT_KEY_ID=local-key \
MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64="$(openssl rand -base64 32)" \
  pnpm dev
```

The service listens on `0.0.0.0:8081` by default. Override the bind address
with `HOST` and the port with `PORT`. Health endpoints are:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | backward-compatible liveness |
| `GET /health/live` | process liveness |
| `GET /health/ready` | PostgreSQL readiness, returning `503` when unavailable |

```bash
curl http://localhost:8081/health/ready
```

```json
{"checks":{"database":"UP"},"status":"UP"}
```

Integration Core is deliberately excluded from readiness. Core outages are
handled through durable retry and must not prevent the Gateway from accepting
provider webhooks. Database connection acquisition defaults to a bounded two
seconds and can be configured with
`DATABASE_CONNECTION_TIMEOUT_MILLISECONDS` between `100` and `30000`.

`MARKETPLACE_A_CONNECTOR_ID` optionally selects a preconfigured connector. It
defaults to the `MARKETPLACE_A` connector inserted by migration `002`.

The forwarding worker is disabled by default. Enable it after provisioning a
source API key in Integration Core:

```bash
DELIVERY_WORKER_ENABLED=true \
DELIVERY_WORKER_ID=connector-gateway-local \
INTEGRATION_CORE_BASE_URL=http://localhost:8080 \
INTEGRATION_CORE_SOURCE_API_KEY="<provisioned-source-api-key>" \
DATABASE_URL=postgresql://connector_gateway:local-development-only@localhost:5434/connector_gateway \
MARKETPLACE_A_WEBHOOK_CURRENT_KEY_ID=local-key \
MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64="<canonical-base64-secret>" \
  pnpm dev
```

`DELIVERY_WORKER_BATCH_SIZE` defaults to `5`,
`DELIVERY_WORKER_INTERVAL_MILLISECONDS` to `2000`, and
`DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS` to `60000`. The lease must exceed
`INTEGRATION_CORE_TIMEOUT_MILLISECONDS`. Each cycle recovers expired claims
before claiming new work, and the next cycle is scheduled only after the current
one finishes.

This is an in-process scheduler, not an operating-system cron task or Kubernetes
`CronJob`. Every running Gateway replica may execute its own scheduler;
PostgreSQL `SKIP LOCKED`, leases, and fencing tokens coordinate ownership across
replicas.

## Metrics

`GET /metrics` exposes Prometheus text format through the official
`@prometheus-io/client`. Worker metrics use the
`connector_gateway_delivery_worker_` prefix and cover:

- cycles and durations by `completed`, `failed`, or `cancelled` outcome;
- active-cycle state and last successful cycle timestamp;
- claimed deliveries and fixed processing outcomes;
- recovered and stale expired claims;
- the current database-backed eligible backlog and the age of its oldest
  delivery;
- connector configuration counts for the fixed `active`,
  `blocked_configuration`, and `disabled` states;
- the durable latest successful ERP_B checkpoint timestamp and its current age.

Node.js runtime metrics use the `connector_gateway_` prefix. Counters are local
to each process and must be summed across replicas by Prometheus. Operational
gauges come from one PostgreSQL snapshot per scrape and must not be summed across
replicas. The checkpoint timestamp remains meaningful after a process restart.
No worker, delivery, URL, or free-form error value is used as a metric label.
The endpoint uses `Cache-Control: no-store`; production routing should expose it
only to the monitoring network or an internal ingress. A database failure makes
the scrape fail rather than publishing stale operational values.

## Container image

CI publishes the non-root distroless runtime image to:

```text
ghcr.io/pietrorussod/commerce-integration-hub/connector-gateway:latest
ghcr.io/pietrorussod/commerce-integration-hub/connector-gateway:v<version>
```

Pull requests build without publishing, while pushes to `main` update `latest`.
Tags matching `v*` promote the existing image without rebuilding it, but only
when its OCI source revision is an ancestor of the tagged commit. The same tag
therefore represents a coherent repository release even when an unchanged
component was last built by an earlier commit included in that release.

Until the distroless base includes Debian's zlib security update, the Dockerfile
copies the pinned Debian 13 `zlib1g` package's library and package metadata from
a separate build stage. This addresses CVE-2026-76844 and CVE-2026-85091 while
preserving the non-root distroless runtime. Builds require the pinned package to
remain available in the configured Debian repositories. When updating the base,
check whether it includes the fix, remove the temporary stage if it does, and
scan the resulting image. See [Debian security advisory DSA-6613-1](https://lists.debian.org/debian-security-announce/2026/msg00532.html).
