# ADR 0007: Use a Structured Event Envelope with Derived Kafka Metadata

- Status: Accepted
- Date: 2026-08-20

## Context

Kafka supports record headers, but an event type stored only in a transport
header is lost when a value is archived, copied, or moved through a system that
does not preserve Kafka metadata. Keeping all metadata only in the value makes
the event portable, but consumers may need to deserialize it before routing.

CloudEvents recognizes both approaches. Binary content mode places event data
in the record value and event attributes in headers. Structured content mode
keeps event attributes and data together in the value.

## Decision

The authoritative representation is a versioned structured JSON envelope. It
contains the stable event ID, event type and version, aggregate identity,
correlation ID, occurrence time, and nested JSON payload.

The Kafka adapter will derive selected transport metadata from that same
envelope:

- record key: `aggregateId`;
- headers: `event-id`, `event-type`, `event-version`, and `correlation-id`;
- content type: `application/json`.

Internal publication metadata such as worker ID, claim ID, and attempt count is
not included in either the public envelope or routing headers. Re-publishing an
event therefore preserves its event identity and business content.

The JSON value remains authoritative. Consumers may use headers for routing and
diagnostics, but must validate that routed metadata agrees with the envelope
before applying a business effect. The producer adapter must generate value and
headers from one `OutboundIntegrationEvent`, never from separate inputs.

The first implementation uses the repository's bounded domain envelope rather
than claiming CloudEvents conformance. A future interoperability requirement may
map it to CloudEvents without changing the domain event semantics.

## Alternatives

- **Store event metadata only in Kafka headers:** rejected for the initial
  implementation because archived or bridged values would not be self-contained.
- **Store metadata only in the JSON value:** rejected because selected headers
  are useful for routing and production diagnosis without parsing the value.
- **Adopt CloudEvents immediately:** deferred because the current producer and
  consumers are repository-owned and do not yet require cross-organization
  protocol interoperability.

## Consequences

Messages remain portable and inspectable outside Kafka, while consumers retain
cheap access to routing metadata. A small amount of metadata is duplicated, so
serialization and consumer tests must detect divergence. The payload must be
embedded as JSON rather than encoded as an escaped JSON string.

## References

- [CloudEvents specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md)
- [CloudEvents Kafka protocol binding](https://github.com/cloudevents/spec/blob/main/cloudevents/bindings/kafka-protocol-binding.md)
