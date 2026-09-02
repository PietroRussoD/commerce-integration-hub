# ERP_B Polling

This document shows how the Connector Gateway imports cursor-paginated changes
from `ERP_B`. The provider simulator supplies deterministic external behavior;
all mapping, reliability, and persistence rules remain owned by the Gateway.

## Responsibilities

```mermaid
flowchart LR
    Scheduler[Polling scheduler]
    Runner[Bounded polling runner]
    Client[ERP_B HTTP adapter]
    Provider[ERP_B provider or simulator]
    Classifier[Page parser, mapper, and classifier]
    Repository[Polling page repository]
    Database[(Gateway PostgreSQL)]
    Forwarder[Delivery worker]
    Core[Integration Core]

    Scheduler -->|Start one non-overlapping run| Runner
    Runner -->|Acquire, renew, and release lease| Repository
    Runner -->|Fetch cursor page| Client
    Client -->|Bearer-authenticated HTTP request| Provider
    Provider -->|Provider page| Client
    Client -->|Strict typed page| Classifier
    Classifier -->|Deliveries and poison records| Repository
    Repository -->|Atomic page and checkpoint commit| Database
    Database -->|Due forwardable deliveries| Forwarder
    Forwarder -->|Canonical order HTTP request| Core
```

The runner coordinates the workflow but does not interpret provider payloads or
write SQL. The HTTP adapter owns transport policy, the classifier owns provider
semantics, and the repository owns transactional durability and fencing.

## One Polling Run

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant R as Bounded runner
    participant DB as Gateway PostgreSQL
    participant H as ERP_B HTTP adapter
    participant P as ERP_B provider
    participant C as Page classifier

    S->>R: Run(connector, worker, max pages)
    R->>DB: Acquire checkpoint lease
    DB-->>R: Cursor, version, and lease token

    loop Until hasMore=false or page limit
        R->>H: Fetch(cursor, page limit)
        H->>P: GET /orders?cursor=...&limit=...
        P-->>H: Provider JSON page
        H-->>R: Strict typed page
        R->>C: Classify items
        C-->>R: Forwardable deliveries and poison evidence
        R->>DB: Commit page using version and lease token
        Note over R,DB: Deliveries, poison records, and next cursor commit atomically
        DB-->>R: New cursor and checkpoint version
        opt Another page is required
            R->>DB: Renew the same fenced lease
        end
    end

    R->>DB: Release lease
    R-->>S: Typed run outcome and durable counts
```

If a page cannot be fetched, parsed, classified, or committed, its checkpoint
does not advance. Pages committed earlier in the same bounded run remain
durable. The lease is released in every ordinary completion path.

## Durable Progress

With a page limit of two, the deterministic simulator demonstrates this state
change:

```mermaid
flowchart TD
    Initial["Checkpoint<br/>cursor = null<br/>version = 1"]
    PageOne["Provider page 1<br/>chg-demo-001: valid EUR<br/>chg-demo-002: poison JPY<br/>next = cursor-2"]
    CommitOne["Atomic commit<br/>1 RECEIVED delivery<br/>1 PERMANENT_FAILURE poison<br/>cursor = cursor-2<br/>version = 2"]
    PageTwo["Provider page 2<br/>chg-demo-003: valid GBP<br/>next = cursor-3<br/>hasMore = false"]
    CommitTwo["Atomic commit<br/>1 RECEIVED delivery<br/>cursor = cursor-3<br/>version = 3"]
    Released["Lease released<br/>owner = null<br/>token = null"]

    Initial --> PageOne --> CommitOne --> PageTwo --> CommitTwo --> Released
```

The cursor and version are durable progress, not in-memory loop variables. A
new process or another replica resumes from the last committed cursor. The
owner and random lease token fence stale workers, so only the current lease
holder may advance that checkpoint.

## Failure Boundaries

```mermaid
flowchart TD
    Fetch[Fetch provider page]
    Transport{Transport outcome}
    Classify[Parse and classify complete page]
    Content{Page content}
    Commit[Commit records and checkpoint]
    Continue{More pages and budget remains?}
    Stop[Release lease and report outcome]

    Fetch --> Transport
    Transport -->|Success| Classify
    Transport -->|Timeout, unavailable, rate limited| Stop
    Transport -->|401 or 403| Stop
    Classify --> Content
    Content -->|Valid items or bounded poison items| Commit
    Content -->|Malformed page or conflicting identity| Stop
    Commit -->|Stale lease or persistence failure| Stop
    Commit -->|Committed| Continue
    Continue -->|Yes| Fetch
    Continue -->|No| Stop
```

An unsupported item such as the simulator's JPY order is durable poison
evidence, so it does not block the rest of a valid page. A malformed page or two
different payloads using the same provider change ID is ambiguous at page level
and therefore prevents the checkpoint from advancing.

Persisting connector `BLOCKED_CONFIGURATION` after an `ERP_B` `401` or `403`
is the next planned reliability increment. The current typed outcome stops the
run, but does not yet disable later scheduled attempts.

## Related Documentation

- [Gateway delivery lifecycle](gateway-delivery-lifecycle.md) describes the
  delivery claim, forwarding, retry, and recovery state machines.
- [Relational data model](data-model.md) shows delivery and polling tables.
- [Provider simulator](../tools/provider-simulator/README.md) documents the
  local deterministic provider boundary.
