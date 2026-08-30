# ADR 0014: Bound Gateway Delivery Retries

- Status: Accepted
- Date: 2026-08-30

## Context

Retryable Integration Core failures must not cause synchronized retry storms or
remain active forever. Remote `Retry-After` guidance is useful but cannot be
allowed to schedule unbounded delays. Attempt evidence and delivery state must
also remain transactionally consistent.

## Decision

Allow at most five actual HTTP attempts and keep a delivery active for at most
24 hours after durable receipt. Use base delays of 5 seconds, 30 seconds,
2 minutes, and 10 minutes after the first four failures. Apply equal jitter,
producing a delay between half and all of the selected base delay.

A valid `Retry-After` may extend the jittered delay up to the HTTP client's
15-minute cap. It never shortens the local delay. If the fifth attempt fails,
the delivery age is exhausted, or the next attempt would reach or exceed the age
deadline, transition to `EXHAUSTED` instead of scheduling more work.

Persist retry or exhaustion atomically with closure of the current attempt.
Every transition must match delivery ID, worker ID, lease token, and attempt
number. Retry releases the lease and sets `next_attempt_at`; exhaustion releases
the lease and sets `completed_at`.

## Alternatives

- **Immediate retries:** rejected because an outage would amplify load.
- **Fixed delays without jitter:** rejected because workers would retry in
  synchronized waves.
- **Unlimited exponential backoff:** rejected because work could remain active
  indefinitely.
- **Trust `Retry-After` without a cap:** rejected because a remote response
  could violate the local recovery objective.
- **Store retries only in memory:** rejected because schedules and evidence must
  survive restart.

## Consequences

Retry behavior is bounded, durable, and reproducible with injected clock and
randomness. `EXHAUSTED` remains visible for later audited operator recovery; the
gateway does not use a broker dead-letter queue for provider deliveries.
