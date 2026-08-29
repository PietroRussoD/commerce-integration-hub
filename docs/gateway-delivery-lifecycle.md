# Gateway Delivery Claim Lifecycle

This document describes the implemented claim boundary. HTTP forwarding,
completion, retry scheduling, and expired-lease recovery remain later slices.

## Current State Transition

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: Durable webhook receipt
    RECEIVED --> FORWARDING: Due delivery claimed
    RETRY_WAIT --> FORWARDING: Due retry claimed

    note right of FORWARDING
        Completion, retry, and recovery
        are not implemented yet
    end note
```

Only deliveries belonging to an `ACTIVE` connector are eligible. Claims are
ordered by `next_attempt_at`, then `received_at`, and bounded to 100 rows. The
configured lease duration is bounded to five minutes.

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

The transaction commits before any future Integration Core HTTP call. Every
later state transition must match delivery ID, worker ID, and lease token. A
claim does not increment `attempt_count` because no network attempt has started
at that point.

See [ADR 0012](decisions/0012-short-lived-gateway-delivery-claims.md) for the
decision and rejected alternatives.
