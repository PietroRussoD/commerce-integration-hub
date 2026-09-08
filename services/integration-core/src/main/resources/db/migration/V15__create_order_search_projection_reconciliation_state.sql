CREATE TABLE order_search_projection_reconciliation_state
(
    projection_name                                  VARCHAR(100) NOT NULL,
    cursor_received_at                               TIMESTAMPTZ,
    cursor_order_id                                  UUID,
    current_scanned_count                            BIGINT       NOT NULL DEFAULT 0,
    current_applied_count                            BIGINT       NOT NULL DEFAULT 0,
    current_ignored_non_newer_version_count          BIGINT       NOT NULL DEFAULT 0,
    last_completed_at                                TIMESTAMPTZ,
    last_completed_scanned_count                     BIGINT       NOT NULL DEFAULT 0,
    last_completed_applied_count                     BIGINT       NOT NULL DEFAULT 0,
    last_completed_ignored_non_newer_version_count   BIGINT       NOT NULL DEFAULT 0,
    version                                          BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT pk_order_search_projection_reconciliation_state PRIMARY KEY (projection_name),
    CONSTRAINT ck_order_search_projection_reconciliation_state_cursor CHECK (
        (cursor_received_at IS NULL) = (cursor_order_id IS NULL)
    ),
    CONSTRAINT ck_order_search_projection_reconciliation_state_current_counts CHECK (
        current_scanned_count >= 0
        AND current_applied_count >= 0
        AND current_ignored_non_newer_version_count >= 0
        AND current_scanned_count = current_applied_count + current_ignored_non_newer_version_count
    ),
    CONSTRAINT ck_order_search_projection_reconciliation_last_counts CHECK (
        last_completed_scanned_count >= 0
        AND last_completed_applied_count >= 0
        AND last_completed_ignored_non_newer_version_count >= 0
        AND last_completed_scanned_count = last_completed_applied_count + last_completed_ignored_non_newer_version_count
    ),
    CONSTRAINT ck_order_search_projection_reconciliation_state_version CHECK (version >= 0)
);

INSERT INTO order_search_projection_reconciliation_state (projection_name)
VALUES ('order-search');
