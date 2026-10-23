# ADR 0006: Use Bounded Outbox Retries and a Terminal Failure State

- Status: Accepted
- Date: 2026-08-19

## Context

Broker and network failures may be temporary, but malformed messages and some
authorization errors are not. Immediate retries across multiple service
instances can create synchronized load, while unlimited retries can leave an
unpublishable event cycling forever without a clear operational state.

## Decision

Retryable publication failures use bounded exponential backoff with equal
jitter. The delay limit doubles from a configurable base delay to a configurable
maximum. The selected delay is between 50% and 100% of that limit. The maximum
attempt count includes the current publication attempt.

An event becomes terminally `FAILED` when a failure is non-retryable or the
retry policy is exhausted. The transition records `failed_at`, a stable error
code, and a bounded safe message, and releases the active claim. It must match
the event ID, worker ID, and fencing token of the current claim.

`FAILED` events are not selected by normal publisher claims. A future operator
replay capability must be explicit and audited rather than silently resetting
them.

## Alternatives

- **Retry immediately:** rejected because concurrent instances can amplify a
  broker outage.
- **Use fixed delays:** rejected because short outages need fast recovery while
  longer outages need increasing pressure relief.
- **Retry forever:** rejected because permanent failures need a visible terminal
  state and operator decision.
- **Delete failed events:** rejected because it removes diagnostic and replay
  evidence.

## Consequences

Retries are bounded, spread over time, and deterministic in tests through an
injectable jitter source. Terminal failures remain available for diagnosis and
future audited replay. Default retry values are configurable and connected
through CDI and scheduled orchestration. Subsequent increments added bounded
outbox metrics and tested alert rules for backlog, dispatch failures, and
terminal failures; see the [alert runbook](../runbooks/alerts.md).
Audited outbox replay remains unimplemented.
