CREATE INDEX orders_ready_received_id_idx
    ON orders (received_at, id)
    WHERE status = 'READY';
