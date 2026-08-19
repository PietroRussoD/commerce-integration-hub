# Outbox Claim Lifecycle

These diagrams describe the implemented PostgreSQL claim lifecycle. No broker
adapter or scheduled publisher is connected yet; broker interactions are shown
only to explain the transition contract and the resulting delivery guarantee.

## State machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Order transaction commits
    PENDING --> PUBLISHING: Due batch claimed
    PUBLISHING --> PUBLISHED: Exact claim confirmed
    PUBLISHING --> PENDING: Safe failure rescheduled
    PUBLISHING --> PENDING: Expired claim recovered
    PUBLISHING --> FAILED: Permanent or exhausted failure
    PUBLISHED --> [*]
    FAILED --> [*]
```

Completion, rescheduling, and terminal failure must match the event ID, worker
ID, and random claim ID. The claim ID changes on every attempt and fences late
results. Recovery instead selects only claims older than the configured timeout.

## Concurrent claim

```mermaid
sequenceDiagram
    autonumber
    participant WorkerA as Worker A
    participant WorkerB as Worker B
    participant Repository as jOOQ outbox repository
    participant Database as PostgreSQL

    par Claim batch A
        WorkerA->>Repository: claimPending(claim A, worker A, now, limit)
        Repository->>Database: SELECT due PENDING FOR UPDATE SKIP LOCKED
        Repository->>Database: UPDATE selected rows to PUBLISHING
        Database-->>WorkerA: Batch owned by claim A
    and Claim batch B
        WorkerB->>Repository: claimPending(claim B, worker B, now, limit)
        Repository->>Database: SELECT due PENDING FOR UPDATE SKIP LOCKED
        Note over WorkerB,Database: Rows locked by A are skipped
        Repository->>Database: UPDATE different rows to PUBLISHING
        Database-->>WorkerB: Disjoint batch owned by claim B
    end
```

The database transaction ends before any future broker call.

## Completion and retry

```mermaid
sequenceDiagram
    autonumber
    participant Worker
    participant Broker as Future broker adapter
    participant Repository as jOOQ outbox repository
    participant Database as PostgreSQL

    Worker->>Broker: Publish stable event ID and payload
    alt Broker confirms
        Broker-->>Worker: Acknowledged
        Worker->>Repository: markPublished(event, claim, worker, time)
        Repository->>Database: UPDATE exact owned claim to PUBLISHED
    else Retryable failure with attempts remaining
        Broker-->>Worker: Retryable failure
        Worker->>Repository: reschedule(event, claim, worker, retry time, safe error)
        Repository->>Database: UPDATE exact owned claim to PENDING
    else Permanent or exhausted failure
        Broker-->>Worker: Terminal failure
        Worker->>Repository: markFailed(event, claim, worker, time, safe error)
        Repository->>Database: UPDATE exact owned claim to FAILED
    end
```

The repository rejects all three owned transitions if ownership has changed.

## Retry policy

The application policy uses bounded exponential backoff with equal jitter. The
delay limit doubles after each failed attempt up to a configured maximum, while
the actual delay is sampled between 50% and 100% of that limit. Once the maximum
attempt count is reached, the decision is `Exhausted` rather than another retry.

The policy and terminal transition are implemented, but the publisher
orchestrator and production configuration are not connected yet.

## Expiry and ambiguous publication

```mermaid
sequenceDiagram
    autonumber
    participant Old as Old attempt
    participant Broker as Future broker
    participant Recovery
    participant New as New attempt
    participant Database as PostgreSQL

    Old->>Broker: Publish event E with claim A
    Broker-->>Old: Acknowledged
    Note over Old: Process stops before PostgreSQL update
    Recovery->>Database: Recover expired claim A to PENDING
    New->>Database: Claim event E with claim B
    New->>Broker: Publish event E again
    Old-->>Database: Late completion for claim A
    Database-->>Old: Rejected by fencing token
    New->>Database: Complete claim B as PUBLISHED
```

The broker may observe event `E` twice. This is an at-least-once boundary, so the
consumer increment must record the stable event ID and apply its business effect
only once.
