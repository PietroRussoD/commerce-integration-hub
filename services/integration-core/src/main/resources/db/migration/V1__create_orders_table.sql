CREATE TABLE orders
(
    id                UUID         NOT NULL,
    source_system     VARCHAR(64)  NOT NULL,
    external_order_id VARCHAR(128) NOT NULL,
    status            VARCHAR(32)  NOT NULL,
    received_at       TIMESTAMPTZ  NOT NULL,
    CONSTRAINT pk_orders PRIMARY KEY (id),
    CONSTRAINT uk_orders_source_identity UNIQUE (source_system, external_order_id),
    CONSTRAINT ck_orders_status CHECK (status IN ('RECEIVED'))
);
