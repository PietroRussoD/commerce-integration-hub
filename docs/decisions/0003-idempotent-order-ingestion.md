# ADR 0003: Make Order Ingestion Payload-Aware and Idempotent

- Status: Accepted
- Date: 2026-08-14

## Context

External systems retry requests after timeouts and may submit the same order
concurrently. Treating every request as new creates duplicates, while silently
accepting different content under the same external identity hides data
conflicts.

## Decision

`source_system` and `external_order_id` form the order's unique source identity.
PostgreSQL enforces this identity, and insertion uses `ON CONFLICT DO NOTHING`
so the database remains authoritative under concurrent requests.

Each validated order also receives a versioned SHA-256 fingerprint of its
canonical business payload. The representation uses an explicit version, fixed
field order, length-prefixed UTF-8 values, explicit null markers, and normalized
decimals. Internal IDs, source identity, status, and server timestamps are
excluded.

After an identity conflict:

- the same fingerprint returns the existing order as `ALREADY_RECEIVED`;
- a different fingerprint returns the existing order with `PAYLOAD_CONFLICT`;
- neither outcome creates more items, timeline entries, or outbox events.

## Alternatives

- **Trust a caller-supplied idempotency key:** rejected as the primary identity
  because callers may omit or regenerate it and it does not detect conflicting
  content for the same business order.
- **Return the existing order without comparing content:** rejected because it
  would conceal upstream data inconsistencies.
- **Hash serialized JSON:** rejected because property order, formatting, omitted
  values, and serializer changes do not define a stable business representation.
- **Check before inserting:** rejected because an application-level pre-check is
  subject to races without the database unique constraint.

## Consequences

Retries are safe and concurrent ingestion produces one stored aggregate. A
payload conflict is explicit rather than silently overwriting canonical data.

Changing the canonical representation requires a new version and an explicit
compatibility or migration strategy. A new implementation version must not be
deployed as though its fingerprints were directly comparable with stored values
from an earlier version.
