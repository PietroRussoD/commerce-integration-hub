ALTER TABLE order_search_reindex_state
    DROP CONSTRAINT ck_order_search_reindex_state_phase;

ALTER TABLE order_search_reindex_state
    ADD CONSTRAINT ck_order_search_reindex_state_phase CHECK (
        phase IN ('IDLE', 'PREPARING', 'REBUILDING', 'READY_FOR_CUTOVER')
    );
