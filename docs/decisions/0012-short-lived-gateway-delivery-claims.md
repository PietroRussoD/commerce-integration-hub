# ADR 0012: Use Short-Lived Fenced Gateway Delivery Claims

- Status: Accepted
- Date: 2026-08-29

## Context

Multiple Connector Gateway workers must forward due deliveries without sending
the same row concurrently. A worker can also stop after claiming work or return
late after another worker has recovered and reclaimed that delivery.

Database locks cannot remain open during an Integration Core HTTP request.
Worker identity alone is not sufficient fencing because an identity may be
reused after restart or reacquisition.

## Decision

Claim a bounded oldest-first batch in one short PostgreSQL transaction. Select
due `RECEIVED` and `RETRY_WAIT` rows belonging to active connectors with `FOR
UPDATE OF inbound_deliveries SKIP LOCKED`. Transition the selected rows to
`FORWARDING` and assign a worker ID, lease expiry, and random UUID lease token
before committing.

All later completion, retry, and recovery transitions must match the delivery
ID, worker ID, and lease token. The token changes on every claim and fences late
results from an older owner.

Claiming does not increment `attempt_count`: a claim can be abandoned before an
HTTP call starts. The forwarding increment will record an actual call attempt in
a later transaction.

## Alternatives

- **Hold row locks during HTTP forwarding:** rejected because slow or failed
  network calls would create long transactions and exhaust database resources.
- **Select then update without row locking:** rejected because concurrent
  workers could receive the same delivery.
- **Use only worker ID and expiry:** rejected because they do not uniquely
  identify a particular ownership generation.
- **Use an in-memory work queue:** rejected because accepted work and ownership
  must survive process failure and horizontal scaling.

## Consequences

Workers can claim disjoint batches without blocking each other, while short
transactions keep network latency outside PostgreSQL locks. An expired claim is
recoverable without allowing its stale result to mutate the new claim.

Completion, retry, recovery, and attempt recording are required before the
forwarding lifecycle is complete. Operational monitoring must expose expired
leases and claim backlog without using delivery IDs as metric labels.
