ALTER TABLE order_search_projection_reconciliation_state
    ADD COLUMN lease_owner VARCHAR(100),
    ADD COLUMN lease_token UUID,
    ADD COLUMN lease_expires_at TIMESTAMPTZ,
    ADD CONSTRAINT ck_order_search_reconciliation_lease CHECK (
        (lease_owner IS NULL) = (lease_token IS NULL)
        AND (lease_token IS NULL) = (lease_expires_at IS NULL)
    );
