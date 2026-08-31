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
  worker cycle, duration, delivery-outcome, and recovery metrics.

The running provider route returns `202` only after PostgreSQL commit. An
equivalent replay returns the same delivery ID with `Idempotent-Replay: true`;
conflicting bytes for the same provider event return `409`. The opt-in runtime
worker composes claiming, attempt start, Integration Core forwarding, persisted
success, retry, exhaustion, permanent failure, configuration blocking, and
expired-lease recovery. Unit, PostgreSQL integration, and complete worker
process tests verify those boundaries.

The runtime and framework boundary are documented in
[ADR 0010](../../docs/decisions/0010-node-typescript-fastify-gateway.md).
The forwarding boundary and response policy are recorded in
[ADR 0013](../../docs/decisions/0013-classify-integration-core-http-outcomes.md).

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
Compose configuration uses local-only webhook credentials and keeps forwarding
disabled until an Integration Core source credential is supplied.

```mermaid
flowchart LR
    Provider[Marketplace A]
    Gateway[Connector Gateway]
    Migration[One-shot migration job]
    Database[(Gateway PostgreSQL)]
    Core[Integration Core]
    Probe[Compose healthcheck]

    Provider -->|Signed webhook| Gateway
    Migration -->|Apply pending schema| Database
    Gateway -->|Receipt and delivery state| Database
    Probe -->|GET /health/ready| Gateway
    Gateway -.->|Worker disabled by default| Core
```

Stop the persistent services without deleting their database volume with:

```bash
docker compose --profile gateway stop connector-gateway connector-gateway-postgres
```

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
- recovered and stale expired claims.

Node.js runtime metrics use the `connector_gateway_` prefix. Counters are local
to each process and must be summed across replicas by Prometheus. No worker,
delivery, URL, or free-form error value is used as a metric label. The endpoint
uses `Cache-Control: no-store`; production routing should expose it only to the
monitoring network or an internal ingress.
