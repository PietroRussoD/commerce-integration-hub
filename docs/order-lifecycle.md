# Order Lifecycle

The domain model and PostgreSQL constraints support the successful processing
path below.

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: canonical ingestion
    RECEIVED --> PROCESSING: startProcessing
    PROCESSING --> READY: markReady
    READY --> [*]
```

`READY` means that the canonical order has passed the asynchronous processing
boundary and is ready for downstream integrations. It does not claim payment,
inventory, fulfillment, or shipment completion.

Transitions are explicit domain operations. Starting processing from any state
other than `RECEIVED`, or marking an order ready from any state other than
`PROCESSING`, is rejected. PostgreSQL applies the same bounded status set to
orders and timeline entries.

The Kafka consumer executes this path after receiving `OrderReceived.v1`. Inbox
deduplication, the state transitions, processing attempt, timeline entries, and
the pending `OrderReady.v1` outbox event share one PostgreSQL transaction. A
duplicate event is a successful no-op.

## Kafka processing

```mermaid
sequenceDiagram
    autonumber
    participant Broker as Kafka / Redpanda
    participant Connector as SmallRye Kafka connector
    participant Consumer as OrderReceived consumer
    participant Mapper as Event mapper
    participant Processor as Transactional processor
    participant Database as PostgreSQL
    participant DLQ as Dead-letter topic

    Broker->>Connector: OrderReceived.v1 record
    alt Record cannot be deserialized
        Connector->>DLQ: Original record with failure metadata
    else Structured event
        Connector->>Consumer: consume(event)
        Consumer->>Mapper: Validate envelope and map command
        alt Invalid envelope or payload
            Mapper-->>Consumer: Permanent validation failure
            Consumer-->>Connector: Abort retry
            Connector->>DLQ: Rejected record with failure metadata
        else Valid command
            loop Initial attempt plus up to 3 retries for transient failures
                Consumer->>Processor: process(command)
                Processor->>Database: Inbox and processing effects
                alt Processed or duplicate
                    Database-->>Processor: Commit
                    Processor-->>Consumer: Success
                else Transient failure
                    Database-->>Processor: Rollback
                    Processor-->>Consumer: Retryable exception
                else Permanent processing rejection
                    Database-->>Processor: Rollback
                    Processor-->>Consumer: Abort retry
                end
            end
            alt Processed or duplicate
                Consumer-->>Connector: Return normally
                Connector->>Broker: Acknowledge record and commit offset
            else Permanent rejection or retries exhausted
                Consumer-->>Connector: Processing failed
                Connector->>DLQ: Rejected record with failure metadata
            end
        end
    end
```

Each retry enters the transactional processor again and therefore starts a new
transaction. Transient failures wait 500 milliseconds with up to 100
milliseconds of jitter. Invalid events and deterministic processing rejections
are not retried. After a permanent rejection or exhausted retries, the connector
publishes the record to `integration.order.received.dlq.v1`.

Retry and dead-letter handling are message lifecycle concerns, not order
statuses. A rolled-back attempt leaves the order in its previously committed
state; there is no `FAILED` order state in the current model.
