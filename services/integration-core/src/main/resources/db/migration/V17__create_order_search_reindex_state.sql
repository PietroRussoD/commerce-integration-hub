CREATE TABLE order_search_reindex_state
(
    operation_name       VARCHAR(100) NOT NULL,
    source_index         VARCHAR(64),
    candidate_index      VARCHAR(64),
    phase                VARCHAR(32)  NOT NULL DEFAULT 'IDLE',
    cursor_received_at   TIMESTAMPTZ,
    cursor_order_id      UUID,
    scanned_count        BIGINT       NOT NULL DEFAULT 0,
    applied_count        BIGINT       NOT NULL DEFAULT 0,
    ignored_count        BIGINT       NOT NULL DEFAULT 0,
    version              BIGINT       NOT NULL DEFAULT 0,
    lease_owner          VARCHAR(100),
    lease_token          UUID,
    lease_expires_at     TIMESTAMPTZ,
    CONSTRAINT pk_order_search_reindex_state PRIMARY KEY (operation_name),
    CONSTRAINT ck_order_search_reindex_state_phase CHECK (
        phase IN ('IDLE', 'REBUILDING', 'READY_FOR_CUTOVER')
    ),
    CONSTRAINT ck_order_search_reindex_state_indices CHECK (
        (source_index IS NULL) = (candidate_index IS NULL)
        AND (source_index IS NULL OR source_index <> candidate_index)
    ),
    CONSTRAINT ck_order_search_reindex_state_idle CHECK (
        (phase = 'IDLE' AND source_index IS NULL)
        OR (phase <> 'IDLE' AND source_index IS NOT NULL)
    ),
    CONSTRAINT ck_order_search_reindex_state_cursor CHECK (
        (cursor_received_at IS NULL) = (cursor_order_id IS NULL)
    ),
    CONSTRAINT ck_order_search_reindex_state_counts CHECK (
        scanned_count >= 0
        AND applied_count >= 0
        AND ignored_count >= 0
        AND scanned_count = applied_count + ignored_count
    ),
    CONSTRAINT ck_order_search_reindex_state_version CHECK (version >= 0),
    CONSTRAINT ck_order_search_reindex_state_lease CHECK (
        (lease_owner IS NULL) = (lease_token IS NULL)
        AND (lease_token IS NULL) = (lease_expires_at IS NULL)
    )
);

INSERT INTO order_search_reindex_state (operation_name)
VALUES ('order-search');
