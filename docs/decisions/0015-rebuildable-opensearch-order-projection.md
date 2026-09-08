# ADR 0015: Use a Rebuildable OpenSearch Order Projection

- Status: Accepted
- Date: 2026-09-05

## Context

Operators need flexible search without making the authoritative PostgreSQL
schema, its query shapes, or its availability the read-path contract. The
existing Integration Core already publishes `OrderReady.v2` through the
transactional outbox to Kafka. A projection must tolerate duplicate delivery,
restarts, and OpenSearch outages without changing completed order processing.

The project has no demonstrated organisational, scaling, or deployment boundary
that justifies a new projection service.

## Decision

Keep PostgreSQL as the authoritative order store. Add an OpenSearch read model
inside the Integration Core's infrastructure boundary, behind application ports
for projection writes, search reads, reconciliation, and reindexing.

A dedicated Kafka consumer group consumes `OrderReady.v2`. Its document ID is
the canonical `orderId`, so repeated delivery updates the same document rather
than creating duplicates. Projection failure is isolated from the completed
order transaction and follows the consumer's bounded retry and failure policy.

The first mapping is stored in the versioned `orders-v1` index. Clients use the
`orders-read` alias only. Reindexing creates a new versioned index from
authoritative PostgreSQL data, validates it, and switches the read alias only
after successful completion. OpenSearch can therefore be deleted and rebuilt.

Event schema version and aggregate version remain separate concepts. The
projection stores the aggregate version and atomically ignores equal or older
events, preventing duplicate and stale deliveries from overwriting newer state.

## Alternatives

- **Query PostgreSQL directly for all operator search:** rejected because it
  couples operational search to transactional query patterns and does not
  demonstrate a rebuildable read model.
- **Create a separate projection microservice now:** rejected because it adds
  deployment, ownership, security, and observability overhead without a proven
  boundary.
- **Treat OpenSearch as authoritative:** rejected because index loss, mapping
  changes, and asynchronous failure would threaten business correctness.
- **Use an unversioned index name:** rejected because safe mapping evolution and
  alias-based cutover would not be possible.
- **Rebuild only from Kafka retention:** rejected because retention is not a
  durable reconstruction guarantee; PostgreSQL retains the authoritative order
  snapshot.

## Consequences

The Core gains an external OpenSearch dependency, a dedicated consumer group,
version-aware index lifecycle, and read-only search. Search is eventually
consistent and must not imply read-your-writes behavior. Bounded outcome
metrics record successful, stale/duplicate, invalid, and failed projection
attempts. A read-only status API reports whether the projection consumer is
enabled, whether the read alias is available, and the latest completed
reconciliation outcomes.

Reconciliation pages through authoritative READY orders using a durable cursor.
A PostgreSQL lease and a fencing token prevent concurrent instances from
advancing the same checkpoint; a crashed owner can be replaced once its lease
expires. Each scheduled tick processes at most one bounded page and is disabled
by default. Prometheus records bounded run outcomes, document outcomes, and
duration without order or worker identity labels. Full reindexing and persisted
projection-lag metrics remain future work.

## Follow-up

[ADR 0016](0016-version-order-state-and-evolve-ready-event.md) supplies the
aggregate-version contract and moves the projection source to `OrderReady.v2`.
