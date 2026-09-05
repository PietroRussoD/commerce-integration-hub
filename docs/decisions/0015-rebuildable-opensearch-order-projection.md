# ADR 0015: Use a Rebuildable OpenSearch Order Projection

- Status: Accepted
- Date: 2026-09-05

## Context

Operators need flexible search without making the authoritative PostgreSQL
schema, its query shapes, or its availability the read-path contract. The
existing Integration Core already publishes `OrderReady.v1` through the
transactional outbox to Kafka. A projection must tolerate duplicate delivery,
restarts, and OpenSearch outages without changing completed order processing.

The project has no demonstrated organisational, scaling, or deployment boundary
that justifies a new projection service.

## Decision

Keep PostgreSQL as the authoritative order store. Add an OpenSearch read model
inside the Integration Core's infrastructure boundary, behind application ports
for projection writes, search reads, reconciliation, and reindexing.

A dedicated Kafka consumer group consumes `OrderReady.v1`. Its document ID is
the canonical `orderId`, so repeated delivery updates the same document rather
than creating duplicates. Projection failure is isolated from the completed
order transaction and follows the consumer's bounded retry and failure policy.

The first mapping is stored in the versioned `orders-v1` index. Clients use the
`orders-read` alias only. Reindexing creates a new versioned index from
authoritative PostgreSQL data, validates it, and switches the read alias only
after successful completion. OpenSearch can therefore be deleted and rebuilt.

Event schema version and aggregate version remain separate concepts. The
current `OrderReady.v1` event is sufficient for the present one-way
`RECEIVED` to `READY` lifecycle, but the projection must not claim stale-event
ordering until an explicit aggregate-version decision is implemented.

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
index lifecycle, projection metrics, and reconciliation/reindex operations.
Search is eventually consistent and must expose projection state or lag rather
than implying read-your-writes behavior. Future order state transitions require
an explicit aggregate version before stale-event rejection can be guaranteed.

## Follow-up

[ADR 0016](0016-version-order-state-and-evolve-ready-event.md) supplies the
explicit aggregate version this decision requires and moves the projection
source to `OrderReady.v2`. The consumer described above must read the versioned
event rather than `OrderReady.v1`.
