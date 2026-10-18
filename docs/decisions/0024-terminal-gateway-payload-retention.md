# ADR 0024: Retain Active Gateway Payloads Until a Terminal Outcome

- Status: Accepted
- Date: 2026-10-18
- Implementation: schema and migration checks implemented; cleanup, scheduling,
  and concurrency acceptance remain later v1.4.0 increments.

## Context

The Gateway ledger has a `payload_expires_at` timestamp defaulting to database
transaction time plus 30 days. The forwarding worker reads the canonical
payload, and expired-lease recovery must be able to deliver the same work after
a worker failure. A delivery can still be active at expiry, including when its
connector is disabled. Deleting its payload would strand accepted work.

Replay already requires an exhausted delivery with a present, unexpired
canonical payload and an active connector. Receipt deduplication uses a separate
provider fingerprint and delivery identity. Attempts and immutable operator
audit records are independent of the payload columns.

Migration 001 requires raw content; migration 006 permits absent canonical
content only for bounded permanent mapping failures. A timestamp alone does not
make cleanup possible under those constraints, nor establish a safe policy.

## Decision

Treat expiry as eligibility for **terminal payload clearing**, not a deadline
that cancels accepted active work. Raw provider and canonical content share the
same policy; keep both while work is active, including after expiry.

| Condition | Raw provider payload | Canonical payload | Delivery behavior |
| --- | --- | --- | --- |
| Before expiry | Retain | Retain when mapping produced it | Existing forwarding/replay rules |
| Expired `RECEIVED` or `RETRY_WAIT` | Retain | Retain | Continue automatic delivery when the connector permits it |
| Expired `FORWARDING` | Retain | Retain | Allow in-flight completion and existing fenced recovery |
| Expired `DELIVERED`, `PERMANENT_FAILURE`, `BLOCKED_CONFIGURATION`, or `EXHAUSTED` | Clear | Clear when present, in the same transaction | Preserve terminal state and history |
| Replay accepted before expiry and still active after it | Retain | Retain | Complete the accepted replay before clearing |

`BLOCKED_CONFIGURATION` is a terminal **delivery** state. An inactive connector
with queued `RECEIVED`/`RETRY_WAIT` work is a different condition and does not
make that work clearable. An expired `FORWARDING` lease likewise does not
authorize cleanup: the existing recovery process owns the transition.

Equality at `payload_expires_at` means expired. Retention does not extend or
reset that timestamp. Active payloads may remain indefinitely if the delivery
never reaches a terminal outcome; therefore this is not a universal 30-day
maximum or a deletion-at-midnight promise. Existing expired terminal backlog
will be eligible immediately when cleanup is eventually enabled.

### Representation and SQL integrity

Migration 010 permits SQL-null raw content and adds nullable
`payload_cleared_at`. One marker describes the atomic clearing of both columns:

- With no marker, raw content must be a JSON object. Canonical content must
  also be a JSON object, except for the existing SQL-null permanent rejection
  carrying one of the five bounded `ERP_B_*` mapping codes from migration 006.
- With a marker, both payload columns must be SQL NULL and the delivery must
  be terminal. The marker must be at or after both expiry and completion.
- Active deliveries cannot have a marker or lose either payload. An unmappable
  permanent rejection with absent canonical content and no marker remains
  distinguishable from a delivery actually cleared by retention.

Explicit SQL-null predicates prevent PostgreSQL CHECK's UNKNOWN result from
admitting an invalid row. JSON `null`, arrays, and scalars are not absent SQL
payloads or retained JSON objects. Existing lease/completion constraints remain
in place. Changing only the state of a cleared row back to active is invalid.

The constraint validates stored state and timestamp relationships; it does not
sample the current clock or choose rows to delete. The cleanup adapter must
establish real eligibility and write the database cutoff as the marker.
Historical invariants such as never rehydrating a cleared row are application
responsibilities: the CHECK cannot compare an update with its prior state.

### Identity, deduplication, attempts, and audit

Clear columns, not deliveries. Keep IDs, connector ownership, external-event
uniqueness, provider hash, mapping/correlation/trace metadata, expiry, terminal
outcome, delivery attempts, and operator command history. Equivalent provider
redelivery must still resolve to the old identity; conflicting content must
still conflict. Neither webhook nor polling receipt may repopulate cleared
content, change the deadline, or schedule new work on a duplicate.

Do not promise erasure of hashes, identities, audit, Core orders, logs, WAL,
replicas' storage remnants, or backups. This decision covers the two Gateway
ledger payload columns only. The API remains payload-free; exposing additional
clearance metadata, if needed, belongs to the later observable-behavior increment.

### Replay, locking, clocks, and process failure

These are requirements for the subsequent adapter/concurrency increments:

- A new replay after expiry is rejected even if cleanup has not yet run.
  Resolve the delivery row lock before taking its database decision time
  (`clock_timestamp()`), so waiting across expiry cannot authorize replay using
  an old application request time. The current replay adapter still uses the
  application-supplied time; adjusting this race remains pending.
- An accepted replay keeps its payloads when it later crosses expiry while
  active. Repeating an already recorded idempotent command returns its original
  outcome even after later clearing; it must not schedule another delivery.
- One bounded cleanup batch samples one database cutoff, selects uncleared
  terminal rows with expiry and completion at or before that cutoff, orders by
  expiry and ID, and locks delivery rows with `FOR UPDATE SKIP LOCKED`. Recheck
  state under the lock and atomically clear both columns with that cutoff.
  An old cutoff can delay clearing, never justify early clearing.
- Cleanup acquires no connector, attempt, or audit locks and makes no external
  calls while holding row locks. Replay reserves its audit key before locking
  the delivery. Claim, replay, completion and cleanup serialize on the same
  delivery row; do not introduce a reverse audit/connector lock order.
- Concurrent cleanup replicas skip locked rows and do bounded work. Rows already
  cleared are excluded. Rollback or termination before commit leaves content
  retained; a committed batch is safe to repeat after restart.
- The later scheduler is opt-in, non-overlapping per process and bounded per
  cycle. Shutdown stops new batches and settles/rolls back current work before
  pool teardown. A partial expiry/ID index and bounded operational metrics will
  be added with the real cleanup query, not ahead of it.

### Migration and rollback boundary

The forward migration validates existing rows and adds only the nullable
marker; it clears no payloads and preserves all current data. It takes the
table lock needed by PostgreSQL ALTER TABLE and validates the CHECK, so it is
not claimed to be an online migration tested under load. Use the existing
serialized migration hook before Gateway rollout.

The inverse migration is one atomic ALTER that restores the previous raw
NOT NULL and canonical-rejection constraints. It succeeds before any clearing
and fails after a payload has been cleared, leaving the new schema and marker
intact. It never fills an empty JSON object or fabricates original content.
Stopping cleanup or rolling back an application does not recover erased data;
after clearing, schema changes require a forward fix or separately governed
data recovery. There is no new rollback or cleanup administration command.

## Alternatives

- Clear every expired delivery: rejected because this can lose accepted work
  and make worker recovery impossible.
- Delete whole ledger rows: rejected because it loses deduplication identity,
  attempt relationships and recovery audit evidence.
- Clear raw content while keeping active canonical content: possible, but
  introduces a second lifecycle without a demonstrated need in this increment.
  Use one explicit policy and one atomic marker initially.
- Keep a marker without SQL invariants: rejected because partial clearing or
  JSON-null values could look like valid retained or recoverable work.

## Consequences

This increment establishes the decision and schema representation only.
Automated cleanup is still unimplemented, no scheduler is enabled, and the
expiry timestamp is still not an enforced retention policy. PostgreSQL tests
cover upgrade from migration 009, rerun, active/terminal and mapping invariants,
JSON/SQL null distinctions, preserved ledger/history and rollback boundaries.
Batch behavior, concurrency, expiry-wait replay behavior, process shutdown, and
observable API/Console updates need their own acceptance evidence before being
claimed.
