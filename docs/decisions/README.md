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

Accepted records are not edited to hide a later change of direction. A new ADR
supersedes the earlier decision and links back to it.
