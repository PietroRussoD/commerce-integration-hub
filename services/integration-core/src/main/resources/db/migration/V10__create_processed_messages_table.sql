CREATE TABLE processed_messages
(
    consumer_name VARCHAR(100) NOT NULL,
    event_id      UUID         NOT NULL,
    processed_at  TIMESTAMPTZ  NOT NULL,
    CONSTRAINT pk_processed_messages PRIMARY KEY (consumer_name, event_id),
    CONSTRAINT ck_processed_messages_consumer_name_not_blank CHECK (btrim(consumer_name) <> '')
);
