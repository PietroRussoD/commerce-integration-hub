ALTER TABLE outbox_events
    ADD COLUMN failed_at TIMESTAMPTZ;

ALTER TABLE outbox_events
    DROP CONSTRAINT ck_outbox_events_status;

ALTER TABLE outbox_events
    ADD CONSTRAINT ck_outbox_events_status CHECK (
        status IN ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED')
    );

ALTER TABLE outbox_events
    ADD CONSTRAINT ck_outbox_events_failed_state CHECK (
        (
            status = 'FAILED'
            AND failed_at IS NOT NULL
            AND last_error_code IS NOT NULL
            AND last_error_message IS NOT NULL
        )
        OR (
            status <> 'FAILED'
            AND failed_at IS NULL
        )
    );
