ALTER TABLE orders
    DROP CONSTRAINT ck_orders_status;

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_status CHECK (
        status IN ('RECEIVED', 'PROCESSING', 'READY')
    );

ALTER TABLE integration_events
    DROP CONSTRAINT ck_integration_events_from_status;

ALTER TABLE integration_events
    ADD CONSTRAINT ck_integration_events_from_status CHECK (
        from_status IS NULL OR from_status IN ('RECEIVED', 'PROCESSING', 'READY')
    );

ALTER TABLE integration_events
    DROP CONSTRAINT ck_integration_events_to_status;

ALTER TABLE integration_events
    ADD CONSTRAINT ck_integration_events_to_status CHECK (
        to_status IS NULL OR to_status IN ('RECEIVED', 'PROCESSING', 'READY')
    );
