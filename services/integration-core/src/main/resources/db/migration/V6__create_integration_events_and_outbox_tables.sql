CREATE TABLE integration_events
(
    id             UUID          NOT NULL,
    order_id       UUID          NOT NULL,
    event_type     VARCHAR(60)   NOT NULL,
    from_status    VARCHAR(32),
    to_status      VARCHAR(32),
    message        VARCHAR(1000),
    metadata       JSONB         NOT NULL DEFAULT '{}'::JSONB,
    correlation_id UUID          NOT NULL,
    occurred_at    TIMESTAMPTZ   NOT NULL,
    CONSTRAINT pk_integration_events PRIMARY KEY (id),
    CONSTRAINT fk_integration_events_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT ck_integration_events_event_type CHECK (
        event_type IN (
            'ORDER_RECEIVED',
            'PROCESSING_STARTED',
            'PROCESSING_SUCCEEDED',
            'PROCESSING_FAILED',
            'RETRY_REQUESTED'
        )
    ),
    CONSTRAINT ck_integration_events_from_status CHECK (
        from_status IS NULL OR from_status IN ('RECEIVED')
    ),
    CONSTRAINT ck_integration_events_to_status CHECK (
        to_status IS NULL OR to_status IN ('RECEIVED')
    )
);

CREATE INDEX integration_events_order_time_idx
    ON integration_events (order_id, occurred_at);

CREATE INDEX integration_events_correlation_id_idx
    ON integration_events (correlation_id);

CREATE TABLE outbox_events
(
    id                 UUID          NOT NULL,
    aggregate_type     VARCHAR(50)   NOT NULL,
    aggregate_id       UUID          NOT NULL,
    event_type         VARCHAR(100)  NOT NULL,
    event_version      INTEGER       NOT NULL,
    payload            JSONB         NOT NULL,
    correlation_id     UUID          NOT NULL,
    created_at         TIMESTAMPTZ   NOT NULL,
    status             VARCHAR(20)   NOT NULL,
    claimed_by         VARCHAR(100),
    claimed_at         TIMESTAMPTZ,
    next_attempt_at    TIMESTAMPTZ   NOT NULL,
    published_at       TIMESTAMPTZ,
    publish_attempts   INTEGER       NOT NULL DEFAULT 0,
    last_error_code    VARCHAR(100),
    last_error_message VARCHAR(1000),
    CONSTRAINT pk_outbox_events PRIMARY KEY (id),
    CONSTRAINT ck_outbox_events_aggregate_type CHECK (aggregate_type IN ('ORDER')),
    CONSTRAINT ck_outbox_events_event_version_positive CHECK (event_version > 0),
    CONSTRAINT ck_outbox_events_status CHECK (status IN ('PENDING', 'PUBLISHING', 'PUBLISHED')),
    CONSTRAINT ck_outbox_events_publish_attempts_non_negative CHECK (publish_attempts >= 0),
    CONSTRAINT ck_outbox_events_claim_fields CHECK (
        (status = 'PUBLISHING' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL)
        OR (status <> 'PUBLISHING' AND claimed_by IS NULL AND claimed_at IS NULL)
    ),
    CONSTRAINT ck_outbox_events_published_at CHECK (
        (status = 'PUBLISHED' AND published_at IS NOT NULL)
        OR (status <> 'PUBLISHED' AND published_at IS NULL)
    )
);

CREATE INDEX outbox_events_eligible_idx
    ON outbox_events (next_attempt_at, created_at)
    WHERE status = 'PENDING';
