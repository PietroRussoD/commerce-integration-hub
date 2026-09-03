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
    observed($provider.completedAtMs; 20; "reject-authentication"; "POLLING"; "INTERACTION";
        "ERP_AUTHENTICATION_REJECTED"; "erp-b"; "connector-gateway"; "BLOCKED"; [
            { name: "HTTP_STATUS", value: ($provider.httpStatus | tostring) },
            { name: "ERROR_CODE", value: "ERP_B_AUTHENTICATION_REJECTED" }
        ]),
    observed($gateway.connectorBlockedAtMs; 30; "block-connector"; "POLLING"; "STATE_TRANSITION";
        "CONNECTOR_CONFIGURATION_BLOCKED"; "connector-gateway"; "gateway-database"; "BLOCKED"; [
            { name: "CONNECTOR_STATE", value: $gateway.connectorState },
            { name: "CONNECTOR_VERSION", value: ($gateway.connectorVersion | tostring) }
        ]),
    observed($gateway.leaseReleasedAtMs; 40; "release-lease"; "POLLING"; "PERSISTENCE";
        "POLLING_LEASE_RELEASED"; "connector-gateway"; "gateway-database"; "SUCCEEDED"; [
            { name: "CURSOR", value: $gateway.checkpointCursor },
            { name: "CHECKPOINT_VERSION", value: ($gateway.checkpointVersion | tostring) }
        ]),
    observed($gateway.leaseReleasedAtMs; 50; "scenario-blocked"; "COMPLETION"; "OUTCOME";
        "SCENARIO_BLOCKED_CONFIGURATION"; "connector-gateway"; null; "BLOCKED"; [
            { name: "CONNECTOR_STATE", value: $gateway.connectorState },
            { name: "ERROR_CODE", value: "ERP_B_AUTHENTICATION_REJECTED" }
        ])
]
| sort_by(.timestampMs, .priority) as $events
| ($events[0].timestampMs) as $startedAtMs
| ($events[-1].timestampMs) as $completedAtMs
| {
    schemaVersion: "1.0",
    traceId: "erp-b-authentication-rejection-v1",
    scenario: {
        id: "erp-b-authentication-rejection",
        sourceSystem: "ERP_B",
        outcome: "BLOCKED_CONFIGURATION"
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
