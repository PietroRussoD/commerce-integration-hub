CREATE TABLE order_search_projection_progress
(
    projection_name                    VARCHAR(100) NOT NULL,
    last_projected_event_occurred_at   TIMESTAMPTZ,
    last_projected_at                  TIMESTAMPTZ,
    CONSTRAINT pk_order_search_projection_progress PRIMARY KEY (projection_name),
    CONSTRAINT ck_order_search_projection_progress_timestamps CHECK (
        (last_projected_event_occurred_at IS NULL) = (last_projected_at IS NULL)
    ),
    CONSTRAINT ck_order_search_projection_progress_order CHECK (
        last_projected_at IS NULL OR last_projected_at >= last_projected_event_occurred_at
    )
);

INSERT INTO order_search_projection_progress (projection_name)
VALUES ('order-search');
