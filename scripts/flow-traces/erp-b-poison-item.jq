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
    observed($gateway.deliveryRecordedAtMs; 30; "persist-rejection"; "RECEIPT"; "PERSISTENCE";
        "ERP_ITEM_REJECTED"; "connector-gateway"; "gateway-database"; "REJECTED"; [
            { name: "DELIVERY_STATE", value: $gateway.deliveryState },
            { name: "ERROR_CODE", value: $gateway.errorCode }
        ]),
    observed($gateway.deliveryRecordedAtMs; 40; "commit-page"; "RECEIPT"; "PERSISTENCE";
        "ERP_PAGE_COMMITTED"; "connector-gateway"; "gateway-database"; "SUCCEEDED"; [
            { name: "NEXT_CURSOR", value: $gateway.checkpointCursor },
            { name: "CHECKPOINT_VERSION", value: ($gateway.checkpointVersion | tostring) }
        ]),
    observed($gateway.deliveryRecordedAtMs; 50; "scenario-completed"; "COMPLETION"; "OUTCOME";
        "SCENARIO_COMPLETED_WITH_REJECTIONS"; "connector-gateway"; null; "REJECTED"; [
            { name: "ITEM_COUNT", value: ($gateway.pageItemCount | tostring) },
            { name: "ERROR_CODE", value: $gateway.errorCode }
        ])
]
| sort_by(.timestampMs, .priority) as $events
| ($events[0].timestampMs) as $startedAtMs
| ($events[-1].timestampMs) as $completedAtMs
| {
    schemaVersion: "1.0",
    traceId: "erp-b-poison-item-v1",
    scenario: {
        id: "erp-b-poison-item",
        sourceSystem: "ERP_B",
        outcome: "COMPLETED_WITH_REJECTIONS"
    },
    capturedAt: $capturedAt,
    durationMs: ($completedAtMs - $startedAtMs),
    participants: [
        { id: "erp-b", kind: "EXTERNAL_SYSTEM", label: "ERP_B" },
        { id: "connector-gateway", kind: "SERVICE", label: "Connector Gateway" },
        { id: "gateway-database", kind: "DATABASE", label: "Gateway PostgreSQL" }
    ],
    steps: ($events | to_entries | map(
        .value.step + { sequence: (.key + 1), offsetMs: (.value.timestampMs - $startedAtMs) }
    ))
}
