# ADR 0009: Use Bounded Consumer Retries and Dead-Letter Routing

- Status: Accepted
- Date: 2026-08-22

## Context

An `OrderReceived.v1` consumer can fail because of a temporary infrastructure
problem, an invalid event, or a deterministic processing rejection. Treating
every failure alike either discards recoverable work or repeatedly processes a
record that cannot succeed.

Consumer retries are separate from the persistent outbox publication retries
defined in [ADR 0006](0006-bounded-outbox-retries.md). They happen locally while
handling one Kafka delivery and do not create an order failure state.

## Decision

The consumer acknowledges records only after processing returns successfully.
A first delivery and duplicate inbox delivery are both successful outcomes.

Failures are classified as follows:

- malformed records that cannot become a structured event are sent directly to
  the dead-letter topic by the Kafka connector;
- invalid envelopes or payloads and `OrderProcessingRejectedException` are
  deterministic failures and abort retry;
- other exceptions are considered transient and receive at most three retries,
  separated by 500 milliseconds with up to 100 milliseconds of jitter.

Every invocation enters the transactional processor again. A failed attempt
rolls back its inbox marker and processing effects before a retry begins. If a
permanent failure occurs or transient retries are exhausted, the connector
publishes the rejected record and failure metadata to
`integration.order.received.dlq.v1`.

Dead-letter replay is an explicit future operator action. The normal consumer
does not automatically read from the dead-letter topic.

## Alternatives

- **Retry every failure:** rejected because invalid and deterministically
  rejected events cannot become valid by waiting.
- **Never retry in the consumer:** rejected because short database or network
  failures should not immediately require operator intervention.
- **Retry indefinitely:** rejected because one poison record could prevent
  progress without producing a terminal operational signal.
- **Publish dead letters in application code:** rejected because the connector
  already preserves the failed Kafka record and transport failure metadata.
- **Add `FAILED` to the order lifecycle:** rejected because delivery failure
  does not establish a business failure of the order.

## Consequences

Transient failures receive a small bounded recovery window, while poison
records leave the main delivery path. Unexpected programming failures are also
retried, but only three times before dead-letter routing.

Retries delay progress for the affected delivery and sustained transient
failure rates reduce consumer throughput. Dead-letter retention, alerting,
inspection, and audited replay require operational policy before production
use.
