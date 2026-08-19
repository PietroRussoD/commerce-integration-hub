# ADR 0005: Use Short-Lived Outbox Claims with Fencing Tokens

- Status: Accepted
- Date: 2026-08-19

## Context

The outbox publisher must coordinate multiple service instances without holding
a PostgreSQL transaction open while a broker call is in progress. A worker may
also stop or lose its response after the broker accepted a message, leaving an
event in an ambiguous state.

## Decision

A worker claims a bounded batch of due `PENDING` events in a short transaction.
The query uses row locks with `SKIP LOCKED`, and the selected records transition
to `PUBLISHING` with a worker ID, claim time, random claim ID, and incremented
attempt count before the transaction commits.

The random claim ID is a fencing token. Completion and failure transitions must
match event ID, worker ID, and claim ID. A late result from an expired claim
cannot update a later attempt, even when the same worker ID is reused.

A confirmed publication transitions the exact claim to `PUBLISHED`. A safe,
classified failure returns it to `PENDING` with a future attempt time. Recovery
returns expired claims to `PENDING` in bounded, concurrently safe batches and
records `CLAIM_EXPIRED` without incrementing the attempt count again.

## Alternatives

- **Keep the database transaction open during broker publication:** rejected
  because broker latency would extend row-lock and connection ownership.
- **Use only worker ID as ownership:** rejected because the same worker can
  reclaim an expired event while an older asynchronous result is still pending.
- **Delete an event after publication:** rejected because publication history
  and reconciliation evidence would be lost.
- **Claim delivery is exactly once:** rejected because a crash after broker
  acceptance but before the PostgreSQL update remains ambiguous.

## Consequences

Database coordination remains short and horizontally scalable. Claim ownership
is explicit and stale results are fenced, but broker delivery remains
at-least-once. A recovered event may be published again, so every consumer must
deduplicate by stable event ID before applying business effects.

Broker integration and scheduling are separate implementation steps. This ADR
defines the persistence lifecycle and does not claim that messages are already
being published.
