# Outbox Claim Lifecycle

These diagrams describe the implemented PostgreSQL claim lifecycle, Kafka
publication adapter, scheduled dispatch cycle, and scheduled expired-claim
recovery.

## Runtime map

Start here. The outbox flow has three entry points; the remaining classes are
called from one of these paths.

| Entry point | Trigger | Responsibility |
| --- | --- | --- |
| Order ingestion | `POST /api/v1/orders` | Commit the order and a `PENDING` event atomically |
| Dispatch scheduler | Every second | Claim and publish up to five due events |
| Recovery scheduler | Every 30 seconds | Return up to 100 claims older than two minutes to `PENDING` |

```mermaid
flowchart LR
    HTTP[Order HTTP request] --> TX[Order transaction]
    TX --> Pending[(PENDING)]

    Dispatch[Dispatch scheduler] --> Claim[Claim due batch]
    Pending --> Claim
    Claim --> Publishing[(PUBLISHING)]
    Publishing --> Kafka[Publish to Kafka]
    Kafka -->|Acknowledged| Published[(PUBLISHED)]
    Kafka -->|Retryable failure| Pending
    Kafka -->|Permanent or exhausted| Failed[(FAILED)]

    Recovery[Recovery scheduler] -->|Claim older than 2 minutes| Pending
    Publishing -. inspected by .-> Recovery
```

The dispatch call tree is:

```text
OutboxDispatchScheduler
  -> DispatchOutboxBatchUseCase
     -> ClaimOutboxEventsUseCase
        -> OutboxEventRepository.claimPending
     -> PublishClaimedOutboxEventUseCase, once per claimed event
        -> OutboxEventPublisher.publish
        -> acknowledged: CompleteOutboxEventUseCase
           -> OutboxEventRepository.markPublished
        -> retryable: RescheduleOutboxEventUseCase
           -> OutboxEventRepository.rescheduleAfterFailure
        -> permanent or exhausted: FailOutboxEventUseCase
           -> OutboxEventRepository.markFailed
```

The recovery call tree is independent:

```text
OutboxClaimRecoveryScheduler
  -> RecoverExpiredOutboxClaimsUseCase
     -> OutboxEventRepository.recoverExpiredClaims
```

The schedulers decide **when** to start. Application use cases decide **what**
must happen. The Kafka publisher and jOOQ repository adapters decide **how** to
communicate with external infrastructure. `OutboxApplicationConfiguration`
assembles these dependencies through CDI; it does not execute the workflow.

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
    participant Broker as Kafka publisher adapter
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

## Kafka adapter boundary

```mermaid
sequenceDiagram
    autonumber
    participant UseCase as Publication use case
    participant Publisher as Kafka publisher adapter
    participant Mapper as Event and metadata mappers
    participant Broker as Kafka / Redpanda

    UseCase->>Publisher: publish(outbound event)
    Publisher->>Mapper: Build JSON envelope, key, and headers
    alt Invalid event payload
        Mapper-->>Publisher: Validation failure
        Publisher-->>UseCase: Non-retryable failure
    else Valid event
        Mapper-->>Publisher: Structured message
        Publisher->>Broker: Send and wait for acknowledgement
        alt Broker acknowledges
            Broker-->>Publisher: Acknowledged
            Publisher-->>UseCase: Acknowledged
        else Timeout or transport failure
            Broker-->>Publisher: Failure
            Publisher-->>UseCase: Retryable failure
        else Serialization failure
            Broker-->>Publisher: Failure
            Publisher-->>UseCase: Non-retryable failure
        end
    end
```

Kafka request, delivery, and adapter timeouts are 8, 10, and 12 seconds
respectively. The standard component test uses the SmallRye in-memory connector;
a dedicated integration test uses Redpanda through Kafka Dev Services to verify
the real serialization and transport configuration.

## Retry policy

The application policy uses bounded exponential backoff with equal jitter. The
delay limit doubles after each failed attempt up to a configured maximum, while
the actual delay is sampled between 50% and 100% of that limit. Once the maximum
attempt count is reached, the decision is `Exhausted` rather than another retry.

The policy, terminal transition, publisher orchestrator, and runtime
configuration are connected. Bounded dispatch and recovery metrics, backlog
gauges (waiting events, the oldest one's age, terminally failed events), and
tested alert rules on them are implemented; see the
[alert runbook](runbooks/alerts.md).

## Expiry and ambiguous publication

```mermaid
sequenceDiagram
    autonumber
    participant Old as Old attempt
    participant Broker as Kafka / Redpanda
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
implemented consumer records the stable event ID and applies its business effect
only once.
