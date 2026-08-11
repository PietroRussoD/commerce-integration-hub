CREATE TABLE order_items
(
    id               UUID           NOT NULL,
    order_id         UUID           NOT NULL,
    external_line_id VARCHAR(150),
    sku              VARCHAR(100)   NOT NULL,
    description      VARCHAR(500),
    quantity         NUMERIC(19, 4) NOT NULL,
    unit_price       NUMERIC(19, 4) NOT NULL,
    line_amount      NUMERIC(19, 2) NOT NULL,
    position         INTEGER        NOT NULL,
    CONSTRAINT pk_order_items PRIMARY KEY (id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT uk_order_items_order_position UNIQUE (order_id, position),
    CONSTRAINT uk_order_items_order_external_line UNIQUE (order_id, external_line_id),
    CONSTRAINT ck_order_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT ck_order_items_unit_price_non_negative CHECK (unit_price >= 0),
    CONSTRAINT ck_order_items_line_amount_non_negative CHECK (line_amount >= 0),
    CONSTRAINT ck_order_items_position_non_negative CHECK (position >= 0)
);
