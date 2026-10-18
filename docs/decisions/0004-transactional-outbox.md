# ADR 0004: Persist Integration Events with a Transactional Outbox

- Status: Accepted
- Date: 2026-08-14

## Context

Successful order ingestion must eventually notify downstream components. A
direct database write followed by a broker publish can leave the two systems
inconsistent when either operation fails.

## Decision

The initial order, its items, one `ORDER_RECEIVED` timeline entry, and one
versioned `OrderReceived` outbox record are inserted in the same PostgreSQL
transaction. Failure of any insert rolls back the complete operation.

New outbox records start as `PENDING` and contain a versioned JSON payload,
aggregate identity, correlation ID, creation time, and retry metadata. The table
also reserves claim and publication fields for the later publisher increment.
Equivalent and conflicting replays do not create additional events.

Timeline records have a physical order foreign key. The outbox aggregate ID is a
logical reference because the table is designed to carry events for more than
one aggregate type.

## Alternatives

- **Publish directly after committing PostgreSQL:** rejected because a crash can
  persist an order without publishing its event.
- **Publish first and then write PostgreSQL:** rejected because consumers can
  observe an order that fails to persist.
- **Distributed transactions:** rejected because PostgreSQL and the future event
  broker should not be coupled through a two-phase commit coordinator.
- **Change data capture:** deferred because it adds operational infrastructure
  before the project needs it and makes the published contract less explicit.

## Consequences

Database state and publication intent are atomic, while delivery to the broker
is eventually consistent. The publisher and consumers must tolerate
at-least-once delivery, and consumers must be idempotent.

Event payloads require explicit versions and compatibility discipline. At the
time this decision was accepted, publisher leasing, retries, broker integration,
and consumption were future increments; this record defines the atomic
persistence boundary only.

## Follow-up

Later decisions define the implemented claim and retry lifecycle
([ADR 0005](0005-short-lived-outbox-claims.md),
[ADR 0006](0006-bounded-outbox-retries.md)), event envelope
([ADR 0007](0007-structured-event-envelope.md)), and consumer processing and
dead-letter behavior
([ADR 0008](0008-transactional-inbox-order-processing.md),
[ADR 0009](0009-bounded-consumer-retries-and-dead-letter-routing.md)). The
current runtime is described in the [outbox lifecycle](../outbox-lifecycle.md).
