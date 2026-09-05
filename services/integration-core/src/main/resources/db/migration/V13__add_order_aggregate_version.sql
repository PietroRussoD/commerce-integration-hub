ALTER TABLE orders
    ADD COLUMN aggregate_version BIGINT NOT NULL DEFAULT 1,
    ADD CONSTRAINT ck_orders_aggregate_version_positive CHECK (aggregate_version > 0);
