# ADR 0018: Reindex OpenSearch Through a Dual-Write Cutover

- Status: Accepted
- Date: 2026-09-08

## Context

The order search projection uses `orders-read` as both the query alias and the
consumer write target. Creating a new index and backfilling it from PostgreSQL
without accounting for concurrent `OrderReady.v2` deliveries can leave the
candidate behind the active index at cutover.

PostgreSQL remains authoritative, but a scan alone is not a safe cutover
protocol. An order can become ready or receive a newer aggregate version while
the scan is in progress. A reindex must keep the existing read path available
and must not expose a partial candidate to operators.

## Decision

Treat reindexing as a durable, internal operation with a lease and explicit
stages. It is not an HTTP endpoint in the portfolio scope.

1. Acquire the reindex lease and create a uniquely versioned candidate index
   with no read alias.
2. Persist the candidate and enable temporary dual writes: every projection
   write targets both the active `orders-read` alias and the candidate index.
3. Backfill authoritative READY-order snapshots into the candidate in bounded
   keyset pages. Target-specific upserts keep aggregate-version protection for
   duplicate and stale deliveries.
4. Validate the candidate's schema and document count against an authoritative
   read performed after backfill. Validation failure preserves the current read
   alias and leaves evidence for diagnosis.
5. Atomically move `orders-read` from the old index to the candidate. A write
   that overlaps the swap is safe: before the swap it also reaches the
   candidate; after the swap the active alias already resolves to it.
6. Disable dual writing only after the swap. Retain the prior index for an
   explicit rollback window; deletion is a separate, audited operation.

```mermaid
sequenceDiagram
    participant R as Reindex runner
    participant P as PostgreSQL
    participant C as Projection consumer
    participant O as OpenSearch

    R->>P: acquire lease and persist candidate
    R->>O: create orders-vN candidate
    Note over C,O: dual-write active
    C->>O: upsert orders-read
    C->>O: upsert orders-vN
    loop bounded keyset pages
        R->>P: read READY snapshots
        R->>O: versioned upsert orders-vN
    end
    R->>P: validate authoritative count
    R->>O: atomically move orders-read to orders-vN
    Note over C,O: dual-write disabled; old index retained for rollback
    R->>P: complete operation and release lease
```

## Alternatives

- **Backfill then swap without dual writes:** rejected because concurrent
  deliveries can be absent from or newer than the candidate at cutover.
- **Pause the Kafka consumer for reindexing:** rejected because it creates
  avoidable lag and still needs a crash-safe restart protocol.
- **Rebuild from Kafka retention only:** rejected because broker retention is
  not the authoritative reconstruction source.
- **Expose a public operator reindex endpoint now:** rejected because an
  operational command requires authentication, author identity, reason,
  auditing, progress, and rollback authorization.

## Consequences

The implementation uses a dedicated reindex operation state, lease, candidate
target abstraction, dual-write routing, bounded progress metrics, and an
integration test that injects a concurrent projection write during backfill.
The reconciliation state is intentionally not reused: reconciliation repairs
the active projection, while reindexing changes its physical target and has a
different lifecycle. Starting the operation remains an internal boundary until
a dedicated authenticated and audited command is implemented.
