# Gateway Delivery Claim Lifecycle

This document describes the implemented claim, attempt, completion, and recovery
boundaries. The Integration Core HTTP adapter, application batch worker, and
non-overlapping runtime scheduler are implemented and tested.

## Provider Delivery Identity

`MARKETPLACE_A` identifies a delivery by its provider event ID and fingerprints
the exact signed webhook bytes. Byte-level differences therefore remain visible
even when two JSON documents would parse to equivalent values.

`ERP_B` extracts individual changes from a polled page, so no independently
signed raw body exists for one delivery. Its receipt command reconstructs a
fixed-key JSON representation containing every validated provider field and
canonicalization version `erp-b-provider-item-v1`, then computes SHA-256 over
that representation. Object property insertion order cannot change the result;
position order remains significant because it is part of the mapped order.
Mapping version and provider-item canonicalization version are separate
compatibility boundaries. The bounded provider HTTP adapter and atomic
page/checkpoint repository are composed by an implemented single-page use case.
The implemented bounded runner composes lease acquisition, multiple committed
pages, renewal between pages, a hard page limit, and final release. Scheduled
execution is implemented as an immediate, non-overlapping, cancellation-aware
adapter that waits for each run before starting its interval. `main.ts` composes
the complete polling path only when explicitly enabled and stops it before
closing PostgreSQL.
Bounded run outcomes, duration, activity, committed pages, durable item outcomes,
and last success are exported through Prometheus without identity labels.

The implemented pure page classifier converts mappable changes into ordinary
inbound-delivery commands and mapping failures into bounded permanent-rejection
records with stable `ERP_B_*` error codes. Equivalent duplicate change IDs in
one page collapse to one record. A duplicate ID with a different item
fingerprint rejects the entire page, preventing a later checkpoint transaction
from advancing across ambiguous provider evidence.

Migration `006` adds the seeded `ERP_B` polling checkpoint and permits a null
canonical payload only for a terminal poison item carrying one of the bounded
mapping error codes. The forwarding claim query excludes null canonical
payloads explicitly. Atomic persistence of a classified page and checkpoint is
implemented and PostgreSQL integration-tested.

Migration `010` extends that representation with atomic terminal payload
clearance metadata. It preserves the mapping exception and continues to require
payloads for every active state. Automated retention is still pending; see the
[retention policy](#payload-retention-policy).

## Polled Page Commit

```mermaid
sequenceDiagram
    participant Poller
    participant Repository
    participant DB as Gateway PostgreSQL

    Poller->>Repository: try acquire(connector, new lease token)
    Repository->>DB: conditional update if lease is absent or expired
    DB-->>Poller: checkpoint snapshot or unavailable
    opt lease approaches expiry during a bounded run
        Poller->>Repository: renew(current owner and token)
        Repository->>DB: extend only a valid current lease
    end
    Poller->>Poller: fetch and classify one strict provider page
    Poller->>Repository: commit page(expected version, lease token)
    Repository->>DB: BEGIN and lock checkpoint FOR UPDATE
    Repository->>DB: verify version, owner, token, and expiry
    Repository->>DB: insert deliveries and terminal poison records
    Repository->>DB: advance cursor and version
    alt complete page is valid
        DB-->>Repository: COMMIT
        Repository-->>Poller: COMMITTED
    else stale ownership, payload conflict, or database failure
        DB-->>Repository: ROLLBACK
        Repository-->>Poller: stale/conflict result or infrastructure error
    end
    Poller->>Repository: release(current owner and token)
    Repository->>DB: clear ownership if fencing still matches
```

Equivalent replays do not create duplicate delivery rows but still allow the
page cursor to advance. A reused provider identity with a different fingerprint
rolls back earlier inserts from that page. Concurrent commits for the same
checkpoint version serialize on the row lock; exactly one advances the version.
Lease acquisition similarly uses one conditional update, so concurrent workers
cannot both own an available checkpoint. Reclaiming an expired lease installs a
new token that fences the previous worker without changing the cursor version.
Renewal matches connector, owner, token, and a still-valid expiry, and uses the
later of the existing and requested expiry so a heartbeat cannot shorten a
lease. Release clears ownership only while owner and token still match; this
also permits cleanup after expiry when no new poller has acquired the row.
The runner never retries a failed page inline. It returns the typed failure to
runtime policy, preserves counts from pages already committed, and releases its
lease. Reaching the page limit is a successful bounded outcome: the next run
continues from the last durable cursor.

## Current State Transition

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: Durable webhook receipt
    RECEIVED --> FORWARDING: Due delivery claimed
    RETRY_WAIT --> FORWARDING: Due retry claimed
    FORWARDING --> DELIVERED: Successful attempt completed
    FORWARDING --> RETRY_WAIT: Retryable attempt scheduled
    FORWARDING --> EXHAUSTED: Retry budget or age exhausted
    FORWARDING --> PERMANENT_FAILURE: Request permanently rejected
    FORWARDING --> BLOCKED_CONFIGURATION: Core authentication rejected
    FORWARDING --> RETRY_WAIT: Expired lease recovered
    FORWARDING --> EXHAUSTED: Expired lease exceeds delivery age
```

Only deliveries belonging to an `ACTIVE` connector are eligible. Claims are
ordered by `next_attempt_at`, then `received_at`, and bounded to 100 rows. The
configured lease duration is bounded to five minutes.

The persisted terminal vocabulary is `DELIVERED`, `PERMANENT_FAILURE`,
`BLOCKED_CONFIGURATION`, and `EXHAUSTED`. These states require a completion
timestamp and no lease. All transitions shown above are implemented and tested
at repository and application-orchestration boundaries.

## Concurrent Claim

```mermaid
sequenceDiagram
    participant A as Worker A
    participant B as Worker B
    participant DB as Gateway PostgreSQL

    par Worker A transaction
        A->>DB: Select due batch FOR UPDATE SKIP LOCKED
        A->>DB: Set FORWARDING, owner A, token A, expiry
        DB-->>A: Claimed batch A
    and Worker B transaction
        B->>DB: Select due batch FOR UPDATE SKIP LOCKED
        B->>DB: Set FORWARDING, owner B, token B, expiry
        DB-->>B: Disjoint batch B
    end
```

The transaction commits before the Integration Core HTTP call. Every
later state transition must match delivery ID, worker ID, and lease token. A
claim does not increment `attempt_count` because no network attempt has started
at that point.

## Processing Batch

```mermaid
sequenceDiagram
    participant W as Batch worker
    participant DB as Gateway PostgreSQL
    participant C as Integration Core

    W->>DB: Claim bounded due batch
    par Each claimed delivery
        W->>DB: Fence claim and open attempt
        DB-->>W: Attempt number and receipt time
        W->>C: POST canonical order
        C-->>W: Typed HTTP outcome
        W->>DB: Fence and persist outcome
    end
```

The application worker executes the claimed batch concurrently. The claim batch
size therefore also bounds HTTP concurrency. A stale attempt start is never
forwarded, and a stale completion is counted separately from the remote outcome.
Unexpected infrastructure failure is propagated; its claim remains
`FORWARDING` for the expired-lease recovery cycle.

The runtime executes recovery before processing, waits for a cycle to finish
before scheduling the next one, and logs only cycles with activity or unexpected
failure. Shutdown aborts in-flight HTTP work, waits for the active cycle, and
then closes PostgreSQL. The worker is explicitly enabled through configuration;
receipt-only operation remains available.

Scheduling runs inside the long-lived Node.js process using a one-shot timer
created only after the preceding cycle completes. It is not an external cron or
Kubernetes `CronJob`. Multiple service replicas can run the scheduler because
database row locks, leases, and fencing tokens coordinate delivery ownership.
The process-level integration test exercises this runtime from a signed webhook
through a real PostgreSQL ledger and local HTTP core to `DELIVERED`, then verifies
graceful `SIGTERM` shutdown and absence of configured secrets from captured logs.

Prometheus records cycle outcomes and duration, active-cycle state, last
successful cycle time, fixed delivery outcomes, and recovery outcomes. Labels
are bounded enums; delivery and worker identities remain in logs and the ledger,
not metric labels.

The `delivery_attempts` table now defines the evidence written when a real call
starts and completes. The fenced start operation atomically verifies the current
unexpired claim, increments `attempt_count`, and inserts the open attempt. A
stale worker changes nothing. Successful completion atomically closes the
current attempt, records duration,
HTTP status and core order ID, clears the lease, and moves the delivery to
`DELIVERED`. A mismatched claim changes nothing, while missing current attempt
evidence rolls back the whole completion transaction.

## Expired Lease Recovery

```mermaid
sequenceDiagram
    participant R as Recovery cycle
    participant P as Shared retry policy
    participant DB as Gateway PostgreSQL

    R->>DB: Find bounded expired FORWARDING claims
    alt No open attempt
        R->>DB: Fence claim and return to RETRY_WAIT
        Note over R,DB: attempt_count is unchanged
    else Open attempt exists
        R->>P: Evaluate attempt count and delivery age
        P-->>R: RETRY_WAIT or EXHAUSTED
        R->>DB: Fence claim, close attempt, apply decision
    end
    DB-->>R: RECOVERED or STALE_CLAIM
```

Retryable completion uses at most five actual attempts and a 24-hour delivery
age. Equal jitter is applied to base delays of 5 seconds, 30 seconds, 2 minutes,
and 10 minutes. A bounded `Retry-After` may extend but never shorten that delay.
Retry schedules `next_attempt_at`; exhausted work receives a terminal completion
timestamp. Both paths close the attempt and clear the lease atomically.

Permanent failure and blocked configuration also close the current attempt and
delivery atomically. A core `401` or `403` moves an active connector to
`BLOCKED_CONFIGURATION`, preventing further claims. A connector already marked
`DISABLED` is never overwritten by this automatic transition.

Expired leases are scanned in bounded oldest-first batches. Recovery before an
HTTP attempt returns the delivery to `RETRY_WAIT` immediately without changing
`attempt_count`. Recovery with an open attempt closes that attempt as
`RETRYABLE_FAILURE` and applies the same bounded retry policy as an ordinary
transport failure. The recovery update matches the observed owner, token,
attempt number, and expiry; a changed claim returns `STALE_CLAIM`, while changed
attempt evidence rolls back the transaction for reevaluation on a later scan.

The HTTP adapter maps Integration Core responses to delivered, blocked
configuration, permanent failure, or retryable failure. It does not update the
ledger. This keeps network policy separate from fenced state transitions and
allows a late worker result to be rejected safely.

See [ADR 0012](decisions/0012-short-lived-gateway-delivery-claims.md) for the
claim decision and [ADR 0013](decisions/0013-classify-integration-core-http-outcomes.md)
for HTTP outcome classification. [ADR 0014](decisions/0014-bound-gateway-delivery-retries.md)
records the retry policy.

## Controlled Operator Replay

When operator authorization is enabled, the Gateway exposes a state-guarded
`POST /api/v1/operator/deliveries/{deliveryId}/replay` command for a terminal
`EXHAUSTED` delivery. The route requires a verified `platform-admin` JWT, a
reason, and a UUID idempotency key. The Console exposes the same command only
when its in-memory token declares that role; the Gateway remains the enforcing
security boundary.

```mermaid
sequenceDiagram
    participant C as Operator Console
    participant A as Gateway operator API
    participant DB as Gateway PostgreSQL
    participant W as Gateway delivery worker

    C->>A: POST replay with JWT, reason, idempotency key
    A->>A: Verify JWT and require platform-admin
    A->>DB: Insert REQUESTED audit record
    DB->>DB: Lock delivery and validate replayability
    alt EXHAUSTED, active connector, retained payload
        DB->>DB: EXHAUSTED -> RECEIVED
        DB->>DB: Clear terminal error and schedule now
        DB->>DB: Store new local trace context and latest prior attempt context separately
        DB->>DB: Insert SUCCEEDED audit record
        DB-->>A: REPLAYED
        A-->>C: 202 Accepted
        W->>DB: Claim replayed delivery and restore trace contexts
        W->>W: Start attempt span linked to prior attempt
    else Invalid state, inactive connector, or expired payload
        DB->>DB: Preserve delivery state
        DB->>DB: Insert REJECTED audit record
        DB-->>A: Typed rejection
        A-->>C: 409 Conflict
    end
```

Reservation, validation, state transition, and terminal audit entry share one
PostgreSQL transaction. A repeated actor/idempotency-key pair returns the
original outcome only when its action, target, and rationale match exactly; a
different request returns an idempotency conflict. Historical attempts remain
intact and their counter is not reset, so a replay does not bypass the bounded
automatic retry policy or erase forensic evidence.
The replay starts a new locally rooted trace rather than accepting the operator
request's remote parent. The worker resumes that context and adds a span link to
the latest prior attempt with complete W3C context; historical attempts without
one remain replayable without a link. Link metadata is durable across the queue
boundary and is not part of the delivery payload.

## Payload Retention Policy

[ADR 0024](decisions/0024-terminal-gateway-payload-retention.md) defines expiry as
eligibility to clear **terminal** payloads. Raw and canonical content remain
available for expired `RECEIVED`, `RETRY_WAIT`, and `FORWARDING` deliveries,
including work queued behind an inactive connector or recovering an expired
lease. An accepted replay that crosses expiry while active follows the same
rule. This is not a universal 30-day maximum.

Expired `DELIVERED`, `PERMANENT_FAILURE`, `BLOCKED_CONFIGURATION`, and
`EXHAUSTED` rows may clear both payloads atomically while recording
`payload_cleared_at`. The row identity, provider fingerprint, expiry, outcome,
attempts and immutable audit remain. Mapping failures without canonical
content have no clearance marker until their raw content is actually cleared.
New replay remains prohibited after expiry; duplicate receipt must not restore
cleared payloads or extend expiry.

The schema supports this representation and rejects partial or active
clearance. One PostgreSQL-tested batch clears 1–100 eligible deliveries ordered
by expiry and ID, using `FOR UPDATE SKIP LOCKED`, one database cutoff and an
atomic guarded update. Repetition is safe; failed transactions retain content.
Migration 011 adds a partial index for this selection. Duplicate webhook and
polling receipt still recognize equivalence/conflicts without rehydration.

The batch is not invoked by the running Gateway and no scheduler is implemented
yet. The replay adapter's request-time cutoff still needs its locked-row
database-clock adjustment and concurrency tests. Migrations 010/011 clear no
existing data; schema rollback of 010 is possible only before payload clearance.
Erased payloads cannot be recreated by rolling back a migration or application.
