ALTER TABLE outbox_events
    ADD COLUMN claim_id UUID;

ALTER TABLE outbox_events
    DROP CONSTRAINT ck_outbox_events_claim_fields;

ALTER TABLE outbox_events
    ADD CONSTRAINT ck_outbox_events_claim_fields CHECK (
        (
            status = 'PUBLISHING'
            AND claim_id IS NOT NULL
            AND claimed_by IS NOT NULL
            AND claimed_at IS NOT NULL
        )
        OR (
            status <> 'PUBLISHING'
            AND claim_id IS NULL
            AND claimed_by IS NULL
            AND claimed_at IS NULL
        )
    );

CREATE INDEX outbox_events_expired_claim_idx
    ON outbox_events (claimed_at, id)
    WHERE status = 'PUBLISHING';
