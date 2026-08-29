# ADR 0011: Use PostgreSQL and Kysely for Gateway Delivery State

- Status: Accepted
- Date: 2026-08-29

## Context

The Connector Gateway must acknowledge a webhook only after durable receipt,
distinguish equivalent replays from payload conflicts atomically, and recover
forwarding work after process failure. This state belongs to the provider-facing
integration boundary, not to the authoritative order service.

## Decision

Store connector configuration and inbound delivery state in gateway-owned
PostgreSQL tables. Manage the schema with ordered Kysely migrations and access
it through a Kysely repository adapter behind the application repository port.

The database enforces foreign keys, bounded state values, payload-hash shape,
lease consistency, and uniqueness of `(connector_id, external_event_id)`. The
gateway and Integration Core use separate schemas, migration histories, and
database identities. They do not read each other's tables and do not share a
distributed transaction.

Migration tests run against the same PostgreSQL major version used by local
Compose. Unit coverage remains container-free; the real migration suite is an
explicit CI step.

## Alternatives

- **MongoDB or DocumentDB:** rejected because the delivery ledger is relational,
  requires strong uniqueness and transactional claiming, and gains no material
  benefit from document-first storage.
- **Reuse the Integration Core schema:** rejected because it couples deployables,
  ownership, credentials, and release cadence.
- **An ORM with active-record entities:** rejected because persistence models
  should not become the application model and the gateway benefits from explicit
  SQL-shaped queries and migrations.
- **Handwritten SQL without a migration framework:** rejected because ordering,
  migration history, locking, and repeatable deployment would need custom code.

## Consequences

Receipt, replay classification, and later worker claims can use PostgreSQL
transactions and constraints. Kysely keeps queries typed without hiding their
relational behavior.

The gateway now owns another stateful component that requires migrations,
backups, retention policy, and operational monitoring. Kysely table types must
remain persistence-only types; canonical application models are mapped at the
adapter boundary.
