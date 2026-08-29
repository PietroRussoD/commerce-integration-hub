# Architecture Decisions

Architecture Decision Records capture significant choices that are costly or
risky to change. Their numbering records documentation order, not importance or
implementation chronology.

- [ADR 0001](0001-source-api-key-authentication.md): structured source
  API-key authentication.
- [ADR 0002](0002-sql-first-postgresql-persistence.md): SQL-first PostgreSQL
  persistence.
- [ADR 0003](0003-idempotent-order-ingestion.md): payload-aware idempotent
  order ingestion.
- [ADR 0004](0004-transactional-outbox.md): transactional outbox persistence.
- [ADR 0005](0005-short-lived-outbox-claims.md): short-lived publisher claims,
  fencing, and recovery.
- [ADR 0006](0006-bounded-outbox-retries.md): bounded retries and terminal
  publication failures.
- [ADR 0007](0007-structured-event-envelope.md): structured JSON events with
  Kafka routing metadata derived from the same envelope.
- [ADR 0008](0008-transactional-inbox-order-processing.md): transactional inbox
  and atomic effects for idempotent order processing.
- [ADR 0009](0009-bounded-consumer-retries-and-dead-letter-routing.md): bounded
  consumer retries, permanent failure classification, and dead-letter routing.
- [ADR 0010](0010-node-typescript-fastify-gateway.md): Node.js, strict
  TypeScript, and Fastify for the provider-facing Connector Gateway.
- [ADR 0011](0011-gateway-postgresql-kysely-persistence.md): gateway-owned
  PostgreSQL delivery state with Kysely migrations and repository adapters.
- [ADR 0012](0012-short-lived-gateway-delivery-claims.md): bounded,
  non-blocking gateway delivery claims with short leases and fencing tokens.

Accepted records are not edited to hide a later change of direction. Later
extensions or replacements are recorded in a new ADR and linked to the earlier
decision.
