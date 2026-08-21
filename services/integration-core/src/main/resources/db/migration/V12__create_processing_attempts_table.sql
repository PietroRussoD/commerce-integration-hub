CREATE TABLE processing_attempts
(
    id             UUID          NOT NULL,
    order_id       UUID          NOT NULL,
    attempt_number INTEGER       NOT NULL,
    status         VARCHAR(20)   NOT NULL,
    trigger_type   VARCHAR(20)   NOT NULL,
    error_code     VARCHAR(100),
    error_message  VARCHAR(1000),
    started_at     TIMESTAMPTZ   NOT NULL,
    completed_at   TIMESTAMPTZ,
    CONSTRAINT pk_processing_attempts PRIMARY KEY (id),
    CONSTRAINT fk_processing_attempts_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT uk_processing_attempts_order_number UNIQUE (order_id, attempt_number),
    CONSTRAINT ck_processing_attempts_number_positive CHECK (attempt_number > 0),
    CONSTRAINT ck_processing_attempts_status CHECK (status IN ('STARTED', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_processing_attempts_trigger_type CHECK (
        trigger_type IN ('INITIAL', 'AUTOMATIC_RETRY', 'MANUAL_RETRY')
    ),
    CONSTRAINT ck_processing_attempts_completion_time CHECK (
        completed_at IS NULL OR completed_at >= started_at
    ),
    CONSTRAINT ck_processing_attempts_state CHECK (
        (
            status = 'STARTED'
            AND completed_at IS NULL
            AND error_code IS NULL
            AND error_message IS NULL
        )
        OR (
            status = 'SUCCEEDED'
            AND completed_at IS NOT NULL
            AND error_code IS NULL
            AND error_message IS NULL
        )
        OR (
            status = 'FAILED'
            AND completed_at IS NOT NULL
            AND error_code IS NOT NULL
            AND btrim(error_code) <> ''
            AND error_message IS NOT NULL
            AND btrim(error_message) <> ''
        )
    )
);

CREATE UNIQUE INDEX processing_attempts_one_active_per_order_idx
    ON processing_attempts (order_id)
    WHERE status = 'STARTED';
