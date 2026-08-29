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
  eligibility, `SKIP LOCKED`, short leases, and UUID fencing tokens.

The running provider route returns `202` only after PostgreSQL commit. An
equivalent replay returns the same delivery ID with `Idempotent-Replay: true`;
conflicting bytes for the same provider event return `409`. Forwarding accepted
deliveries to the Integration Core is the next increment. Claiming is verified
but not scheduled by the running process yet.

The runtime and framework boundary are documented in
[ADR 0010](../../docs/decisions/0010-node-typescript-fastify-gateway.md).

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
starts PostgreSQL 18.3 with Testcontainers and verifies the migration and its
critical constraints.

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
