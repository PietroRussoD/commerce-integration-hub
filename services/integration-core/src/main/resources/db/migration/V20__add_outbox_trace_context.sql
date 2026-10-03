ALTER TABLE outbox_events
    ADD COLUMN traceparent VARCHAR(55),
    ADD COLUMN tracestate VARCHAR(512),
    ADD CONSTRAINT ck_outbox_events_tracestate_requires_traceparent
        CHECK (tracestate IS NULL OR traceparent IS NOT NULL);
