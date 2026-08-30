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
conflicting bytes for the same provider event return `409`. Claiming and the
HTTP client are independently verified but not yet composed into a scheduled
worker. Attempt start is independently verified but not yet invoked by the
runtime. Successful outcome persistence is independently verified, while retry
and exhaustion persistence are also verified. Permanent and configuration
failure transitions, expired-lease recovery, batch orchestration, and runtime
scheduling are verified as well.

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
all pending Kysely migrations against its dedicated local database with:

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
with `HOST` and the port with `PORT`.

```bash
curl http://localhost:8081/health
```

```json
{"status":"UP"}
```

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
