# ADR 0016: Version Order State and Evolve the Ready Event

- Status: Accepted
- Date: 2026-09-05

## Context

The OpenSearch projection must tolerate at-least-once Kafka delivery and future
order-state events arriving out of order. The existing `OrderReady.v1` schema
has an event schema version, but does not identify the version of the order
state represented by its payload. Event ID, publication time, and Kafka offset
cannot safely substitute for an aggregate version across replay, retention, or
reindexing.

## Decision

Persist a positive `aggregate_version` on the authoritative `orders` row.
Receipt creates version `1`. Every successful order-state transition increments
the version by exactly one, and persistence compares the expected version as
well as the expected status before applying the transition.

Publish the new field in `OrderReady.v2`. The event schema version changes
because this is a contract evolution, not a reinterpretation of `v1`. The
projection consumes `OrderReady.v2`, stores the aggregate version in its
document, and rejects an event whose aggregate version is lower than the
indexed version. Repeated delivery of the same version is idempotent.

Existing rows receive aggregate version `1` through a Flyway migration. The
reindex path reads the current authoritative row, so it produces documents with
the correct stored version independently of Kafka retention. `OrderReady.v1`
remains historical evidence but is not emitted by the post-migration runtime.

## Alternatives

- **Use event schema version as order version:** rejected because schema
  compatibility and business-state ordering are independent concerns.
- **Order by event timestamp or Kafka offset:** rejected because clocks,
  partitions, replay, and retention do not provide a durable aggregate order.
- **Use only `orderId` upserts:** rejected because a delayed older state could
  overwrite a later document once additional state events exist.
- **Add `aggregateVersion` silently to `OrderReady.v1`:** rejected because a
  versioned event contract must not change its required semantics in place.

## Consequences

The domain model, Flyway schema, jOOQ records, persistence mapper, status
transitions, `OrderReady` serializer, Kafka routing, Compose topics, tests, and
documentation must change together. The Core gains optimistic version checking
for state transitions and a new `OrderReady.v2` topic. Consumers that need the
new ordering guarantee must consume `v2`; no external `v1` compatibility
bridge is required within the current repository scope.
