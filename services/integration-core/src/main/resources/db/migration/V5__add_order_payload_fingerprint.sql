ALTER TABLE orders
    ADD COLUMN payload_fingerprint VARCHAR(64) NOT NULL,
    ADD COLUMN payload_fingerprint_version SMALLINT NOT NULL,
    ADD CONSTRAINT ck_orders_payload_fingerprint_format
        CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT ck_orders_payload_fingerprint_version
        CHECK (payload_fingerprint_version > 0);
