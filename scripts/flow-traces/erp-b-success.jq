def observed($at; $order; $id; $phase; $kind; $event; $source; $target; $status; $evidence):
    {
        timestampMs: $at,
        priority: $order,
        step: (
            {
                id: $id,
                phase: $phase,
                kind: $kind,
                eventType: $event,
                sourceParticipantId: $source,
                status: $status,
                evidence: $evidence
            }
            + if $target == null then {} else { targetParticipantId: $target } end
        )
    };

[
    observed($provider.requestedAtMs; 10; "request-page"; "POLLING"; "INTERACTION";
        "ERP_PAGE_REQUESTED"; "connector-gateway"; "erp-b"; "INFORMATIONAL";
        [{ name: "HTTP_METHOD", value: "GET" }, { name: "CURSOR", value: "initial" }]),
    observed($provider.completedAtMs; 20; "receive-page"; "POLLING"; "INTERACTION";
        "ERP_PAGE_RECEIVED"; "erp-b"; "connector-gateway"; "SUCCEEDED"; [
            { name: "HTTP_STATUS", value: ($provider.httpStatus | tostring) },
            { name: "ITEM_COUNT", value: ($gateway.pageItemCount | tostring) },
            { name: "NEXT_CURSOR", value: $gateway.checkpointCursor }
        ]),
    observed($gateway.deliveryReceivedAtMs; 30; "commit-page"; "RECEIPT"; "PERSISTENCE";
        "ERP_PAGE_COMMITTED"; "connector-gateway"; "gateway-database"; "SUCCEEDED"; [
            { name: "NEXT_CURSOR", value: $gateway.checkpointCursor },
            { name: "CHECKPOINT_VERSION", value: ($gateway.checkpointVersion | tostring) }
        ]),
    observed($gateway.attemptStartedAtMs; 40; "forward-order"; "FORWARDING"; "INTERACTION";
        "CANONICAL_ORDER_FORWARDED"; "connector-gateway"; "integration-core"; "INFORMATIONAL"; [
            { name: "HTTP_METHOD", value: "POST" },
            { name: "ATTEMPT_NUMBER", value: ($gateway.attemptNumber | tostring) }
        ]),
    observed($core.orderReceivedAtMs; 50; "persist-order"; "RECEIPT"; "PERSISTENCE";
        "CANONICAL_ORDER_PERSISTED"; "integration-core"; "core-database"; "SUCCEEDED";
        [{ name: "ORDER_STATUS", value: $core.receivedStatus }]),
    observed($gateway.attemptCompletedAtMs; 60; "complete-delivery"; "FORWARDING"; "STATE_TRANSITION";
        "DELIVERY_COMPLETED"; "integration-core"; "connector-gateway"; "SUCCEEDED"; [
            { name: "HTTP_STATUS", value: ($gateway.httpStatus | tostring) },
            { name: "DELIVERY_STATE", value: $gateway.deliveryState }
        ]),
    observed($core.outboxPublishedAtMs; 70; "publish-order-event"; "PROCESSING"; "MESSAGE";
        "ORDER_EVENT_PUBLISHED"; "integration-core"; "kafka"; "SUCCEEDED";
        [{ name: "EVENT_TYPE", value: $core.publishedEventType }]),
    observed($core.processingStartedAtMs; 80; "consume-order-event"; "PROCESSING"; "MESSAGE";
        "ORDER_EVENT_CONSUMED"; "kafka"; "integration-core"; "SUCCEEDED";
        [{ name: "ATTEMPT_NUMBER", value: ($core.attemptNumber | tostring) }]),
    observed($core.processingCompletedAtMs; 90; "complete-processing"; "PROCESSING"; "PERSISTENCE";
        "ORDER_PROCESSING_COMPLETED"; "integration-core"; "core-database"; "SUCCEEDED";
        [{ name: "ORDER_STATUS", value: $core.orderStatus }])
]
| sort_by(.timestampMs, .priority) as $observed
| ($observed[0].timestampMs) as $startedAtMs
| ($observed[-1].timestampMs) as $completedAtMs
| ($observed + [
    observed($completedAtMs; 100; "scenario-completed"; "COMPLETION"; "OUTCOME";
        "SCENARIO_COMPLETED"; "integration-core"; null; "SUCCEEDED";
        [{ name: "ORDER_STATUS", value: $core.orderStatus }])
]) as $events
| {
    schemaVersion: "1.0",
    traceId: "erp-b-success-v1",
    scenario: { id: "erp-b-success", sourceSystem: "ERP_B", outcome: "SUCCEEDED" },
    capturedAt: $capturedAt,
    durationMs: ($completedAtMs - $startedAtMs),
    correlationId: $core.correlationId,
    participants: [
        { id: "erp-b", kind: "EXTERNAL_SYSTEM", label: "ERP_B" },
        { id: "connector-gateway", kind: "SERVICE", label: "Connector Gateway" },
        { id: "gateway-database", kind: "DATABASE", label: "Gateway PostgreSQL" },
        { id: "integration-core", kind: "SERVICE", label: "Integration Core" },
        { id: "core-database", kind: "DATABASE", label: "Core PostgreSQL" },
        { id: "kafka", kind: "MESSAGE_BROKER", label: "Kafka / Redpanda" }
    ],
    steps: ($events | to_entries | map(
        .value.step + { sequence: (.key + 1), offsetMs: (.value.timestampMs - $startedAtMs) }
    ))
}
