-- Counting terminally failed events for the backlog metrics must not scan the
-- whole outbox, which keeps every published event.
CREATE INDEX outbox_events_failed_idx
    ON outbox_events (created_at)
    WHERE status = 'FAILED';
