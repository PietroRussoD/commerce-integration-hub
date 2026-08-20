# Current Limitations

This document defines the implemented boundary of the current release. It keeps
the public description precise and prevents planned capabilities from being
mistaken for available behavior.

## Integration Boundary

- The Integration Core accepts the canonical order contract directly. It does
  not yet receive provider-specific webhooks, poll external systems, or perform
  provider-specific normalization.
- PostgreSQL is the only authoritative store. OpenSearch projections and
  reconciliation are not implemented.
- The transactional outbox is persisted atomically with each new order, and the
  scheduled claim-publish-transition and expired-claim recovery cycles are
  implemented. Dead-letter handling and operator replay are outside this
  release.

## API and Operations

- Authentication uses per-source API keys intended for machine-to-machine
  ingestion. User login, OAuth 2.0, JWT-protected operational APIs, and role
  management are not implemented.
- Order access is restricted to the authenticated source. There is no operator
  search, cross-source administration, dashboard, or user interface.
- Health checks, structured logs, correlation IDs, Prometheus runtime metrics,
  and bounded outbox outcome metrics are available. Distributed tracing,
  alerting rules, and production dashboards are not.
- Raw provider payloads are not retained by the canonical API.

## Deployment and Scale

- Docker Compose provides a reproducible local demonstration, not a production
  deployment topology. Cloud infrastructure, secret-manager integration,
  backup automation, high availability, and disaster-recovery procedures are
  not included.
- The release has not been load-tested and makes no throughput or latency claim.
- Orders support `EUR`, `GBP`, and `USD`. Values remain in their original
  currency; foreign-exchange conversion is not performed.

These constraints are deliberate release boundaries. Later increments must add
their own tests, operational evidence, and architecture decisions before the
corresponding capability is claimed.
