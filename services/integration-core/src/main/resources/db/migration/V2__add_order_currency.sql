ALTER TABLE orders
    ADD COLUMN currency CHAR(3) NOT NULL;

ALTER TABLE orders
    ADD CONSTRAINT ck_orders_currency CHECK (currency IN ('EUR', 'GBP', 'USD'));
