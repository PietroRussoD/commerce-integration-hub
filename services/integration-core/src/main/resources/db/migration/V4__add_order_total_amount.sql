ALTER TABLE orders
    ADD COLUMN total_amount NUMERIC(19, 2) NOT NULL;

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_total_amount_non_negative CHECK (total_amount >= 0);
