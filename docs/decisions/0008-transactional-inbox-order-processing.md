# ADR 0008: Process Order Events with a Transactional Inbox

- Status: Accepted
- Date: 2026-08-21

## Context

Kafka provides at-least-once delivery. An `OrderReceived.v1` record may therefore
be delivered again when a consumer restarts or when processing succeeds but the
offset is not committed. Kafka producer idempotence does not prevent these
consumer-side duplicates.

The first processing increment must apply a concrete business effect without
claiming fulfillment, payment, or inventory behavior. In this platform,
`READY` means that the canonical order event has been accepted by the
asynchronous processing boundary and is ready for downstream integrations.

## Decision

The order processor consumes `OrderReceived.v1` from
`integration.order.received.v1`. Before applying an effect, it validates the
supported envelope, event type and version, aggregate identity, and agreement
between the envelope and payload order identifiers.

For a new event, one PostgreSQL transaction:

1. inserts `(consumer_name, event_id)` into `processed_messages`;
2. loads the authoritative order and validates the `RECEIVED` transition;
3. records the processing attempt and timeline transitions;
4. changes the order status to `READY`;
5. inserts a pending `OrderReady.v1` outbox event;
6. commits before Kafka acknowledges the record.

A duplicate inbox key is a successful no-op. It does not create another
attempt, timeline entry, state transition, or outbox event. Inbox registration
and every resulting effect share the same transaction, so a rollback cannot
leave a processed marker without its effects.

At the time of acceptance, the initial increment implemented only successful
processing and duplicate delivery. Retryable and permanent processing failures,
dead letters, and operator replay remained separate increments.

## Alternatives

- **Rely only on committed Kafka offsets:** rejected because a crash between the
  database commit and offset commit can cause redelivery.
- **Store only the event ID:** rejected because different consumers may apply
  independent effects for the same event. The consumer name is part of the
  identity.
- **Mark the inbox record before a separate business transaction:** rejected
  because a failure could suppress an effect that was never committed.
- **Claim end-to-end exactly-once processing:** rejected because Kafka and
  PostgreSQL do not share one atomic transaction.

## Consequences

The consumer can acknowledge duplicate deliveries without repeating business
effects, and multiple service instances can safely share one consumer group.
The database gains an inbox table and processing records, while old inbox rows
require an explicit retention policy before they may be deleted.

The consumer transaction may still commit before its Kafka offset. This can
produce another delivery, but the duplicate becomes a no-op. At the time of
acceptance, invalid and unsupported events still needed an explicit failure
policy before the consumer could be considered operationally complete.

## Follow-up

[ADR 0009](0009-bounded-consumer-retries-and-dead-letter-routing.md) defines the
subsequently implemented retry, permanent failure, and dead-letter policy. It
complements this transaction and deduplication decision; audited operator replay
remains future work.

[ADR 0016](0016-version-order-state-and-evolve-ready-event.md) later replaced
the `OrderReady.v1` event published by this transaction with `OrderReady.v2`,
which carries the order aggregate version. The transaction and deduplication
decision recorded here is unchanged.
