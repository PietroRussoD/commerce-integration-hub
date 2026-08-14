# ADR 0002: Use SQL-First PostgreSQL Persistence

- Status: Accepted
- Date: 2026-08-14

## Context

The Integration Core owns canonical orders, their items, source identities,
timeline entries, and transactional outbox records. These records require unique
business identities, referential integrity, atomic writes, explicit query
behavior, and reliable schema evolution.

## Decision

PostgreSQL is the system of record. Flyway migrations are the authoritative
schema definition and run in version order. jOOQ generates Kotlin table and
record types from those migrations under `target`; generated sources are not
committed.

Application ports isolate persistence I/O. Handwritten jOOQ adapters express SQL
operations and map generated records to framework-independent domain objects.
Integration tests run migrations and queries against PostgreSQL through Quarkus
Dev Services rather than substituting an in-memory database.

PostgreSQL-specific capabilities such as `JSONB`, partial indexes,
`TIMESTAMPTZ`, and `ON CONFLICT` may be used when they provide concrete value.

## Alternatives

- **MongoDB or DocumentDB:** rejected as the canonical store because the current
  model benefits from relational constraints, joins, and multi-table atomicity.
- **Hibernate ORM or Panache:** not selected because this service favors an
  explicit SQL-first schema and avoids coupling domain objects to persistence
  lifecycle behavior.
- **Handwritten JDBC:** rejected because it retains SQL control but loses jOOQ's
  generated schema types and composable query API.
- **H2 for integration tests:** rejected because SQL and constraint behavior must
  be verified against the production database engine.

## Consequences

Schema changes require additive, ordered Flyway migrations and corresponding
integration tests. jOOQ code generation must complete before Kotlin compilation.
The service intentionally depends on PostgreSQL semantics and is not presented
as database-portable.

Domain and application tests remain framework-free. Persistence correctness,
including constraints and transaction behavior, is verified separately with a
real PostgreSQL instance.
