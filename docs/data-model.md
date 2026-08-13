# Relational Data Model

This diagram describes the PostgreSQL schema currently implemented by the
Integration Core. Flyway migrations remain the authoritative schema definition.

```mermaid
erDiagram
    orders ||--o{ order_items : contains
    orders ||--o{ integration_events : records
    orders ||..o{ outbox_events : "logical aggregate reference"

    source_credentials {
        varchar key_id PK
        varchar source_system
        char secret_mac
        smallint pepper_version
        varchar status
        timestamptz created_at
        timestamptz expires_at
        timestamptz revoked_at
    }

    orders {
        uuid id PK
        varchar source_system
        varchar external_order_id
        char currency
        numeric total_amount
        varchar payload_fingerprint
        smallint payload_fingerprint_version
        varchar status
        timestamptz received_at
    }

    order_items {
        uuid id PK
        uuid order_id FK
        varchar external_line_id
        varchar sku
        varchar description
        numeric quantity
        numeric unit_price
        numeric line_amount
        integer position
    }

    integration_events {
        uuid id PK
        uuid order_id FK
        varchar event_type
        varchar from_status
        varchar to_status
        varchar message
        jsonb metadata
        uuid correlation_id
        timestamptz occurred_at
    }

    outbox_events {
        uuid id PK
        varchar aggregate_type
        uuid aggregate_id
        varchar event_type
        integer event_version
        jsonb payload
        uuid correlation_id
        timestamptz created_at
        varchar status
        varchar claimed_by
        timestamptz claimed_at
        timestamptz next_attempt_at
        timestamptz published_at
        integer publish_attempts
        varchar last_error_code
        varchar last_error_message
    }
```

`orders.source_system` and `orders.external_order_id` form one composite unique
key. The two unique constraints on `order_items` combine `order_id` with
`position` and with a non-null `external_line_id`, respectively.

`integration_events.order_id` is a physical foreign key with cascading deletion.
`outbox_events.aggregate_id` is deliberately a logical reference rather than a
foreign key because the outbox is structured to carry events for different
aggregate types. The current schema restricts `aggregate_type` to `ORDER`.

`source_credentials` stores an HMAC of each secret, never the plaintext API key.
Its `source_system` value will become the authenticated source identity when the
HTTP authentication increment is connected.
