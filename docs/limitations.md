# Current Limitations

This document defines the boundary of the current implementation. It keeps
the public description precise and prevents planned capabilities from being
mistaken for available behavior.

## Integration Boundary

- The Integration Core accepts the canonical order contract directly. It does
  not yet receive provider-specific webhooks, poll external systems, or perform
  provider-specific normalization.
- The Connector Gateway contains locally verified `MARKETPLACE_A` authentication,
  validation, mapping, durable receipt, and replay/conflict classification. Its
  schema and repository are tested against PostgreSQL, including concurrent
  receipt. Bounded concurrent claiming, fencing, and Integration Core HTTP
  outcome classification are implemented. Atomic fenced attempt start and
  successful `DELIVERED` completion are verified independently. Retry and
  exhaustion outcomes are persisted by an independently tested adapter;
  permanent and configuration failures are also persisted. Expired claims are
  recovered with fenced retry or exhaustion transitions. The application batch
  worker composes the complete forwarding
  path. Its opt-in runtime scheduler executes recovery-first cycles without
  overlap and supports graceful cancellation. Prometheus exposes bounded worker
  cycle, duration, processing, and recovery metrics. The complete forwarding
  process and metric exposition are covered by an automated PostgreSQL-backed
  integration test.
- The `ERP_B` polling parser, mapper, HTTP client, atomic page/checkpoint
  persistence, fenced lease lifecycle, bounded multi-page runner, configuration,
  and non-overlapping scheduler are implemented and tested. The scheduler is not
  yet composed in `main.ts`, so the running service does not poll ERP_B. Polling
  metrics, blocked-connector persistence, and a synthetic-provider process test
  also remain outside the current runtime boundary.
- PostgreSQL is the only authoritative store. OpenSearch projections and
  reconciliation are not implemented.
- The transactional outbox is persisted atomically with each new order, and the
  scheduled claim-publish-transition and expired-claim recovery cycles are
  implemented. Invalid or retry-exhausted `OrderReceived.v1` deliveries are
  routed to a Kafka dead-letter topic. Operator replay tooling is not
  implemented.

## API and Operations

- Authentication uses per-source API keys intended for machine-to-machine
  ingestion. User login, OAuth 2.0, JWT-protected operational APIs, and role
  management are not implemented.
- Source order access is restricted to the authenticated source. The operator
  API exposes read-only summaries and details across sources. Cross-source
  administration, functional dashboards, and authenticated operator roles are
  not implemented. The operator console exposes a paginated summary,
  operational details, and a controlled canonical-ingestion simulator. The
  simulator keeps its source API key only in page memory and is intended for
  local development and portfolio demonstrations, not production operation.
- Liveness and PostgreSQL readiness checks, structured logs, correlation IDs,
  Prometheus runtime metrics,
  and bounded outbox and Gateway-worker outcome metrics are available.
  Distributed tracing, alerting rules, and production dashboards are not.
  Deployment must restrict `/metrics` to trusted monitoring infrastructure.
- Raw provider payloads are not retained by the canonical API.

## Deployment and Scale

- Docker Compose provides a reproducible local demonstration, not a production
  deployment topology. Cloud infrastructure, secret-manager integration,
  backup automation, high availability, and disaster-recovery procedures are
  not included.
- The release has not been load-tested and makes no throughput or latency claim.
- Orders support `EUR`, `GBP`, and `USD`. Values remain in their original
  currency; foreign-exchange conversion is not performed.

These constraints are deliberate implementation boundaries. Later increments must add
their own tests, operational evidence, and architecture decisions before the
corresponding capability is claimed.
