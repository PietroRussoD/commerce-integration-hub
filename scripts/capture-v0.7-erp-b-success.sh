#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/flow-traces/capture-common.sh"

readonly OUTPUT_FILE="$FLOW_TRACE_ROOT_DIR/apps/operator-console/public/flow-traces/v1/erp-b-success.json"

export PROVIDER_SIMULATOR_ERP_B_SCENARIO=SUCCESS

success_evidence_is_ready() {
    local order_ready delivery_ready
    order_ready="$(flow_trace_core_sql "
        SELECT EXISTS (
            SELECT 1
            FROM orders o
            JOIN processing_attempts pa ON pa.order_id = o.id
            JOIN outbox_events oe ON oe.aggregate_id = o.id
            WHERE o.external_order_id = 'ERP-DEMO-001'
              AND o.status = 'READY'
              AND pa.status = 'SUCCEEDED'
              AND oe.event_type = 'OrderReceived'
              AND oe.status = 'PUBLISHED'
        );
    ")"
    delivery_ready="$(flow_trace_gateway_sql "
        SELECT EXISTS (
            SELECT 1
            FROM inbound_deliveries d
            JOIN delivery_attempts da ON da.delivery_id = d.id
            WHERE d.external_event_id = 'chg-demo-001'
              AND d.status = 'DELIVERED'
              AND da.outcome = 'DELIVERED'
        );
    ")"
    [[ "$order_ready" == "t" && "$delivery_ready" == "t" ]]
}

read_gateway_evidence() {
    flow_trace_gateway_sql "
        SELECT json_build_object(
            'deliveryReceivedAtMs', (EXTRACT(EPOCH FROM d.received_at) * 1000)::bigint,
            'deliveryState', d.status,
            'attemptNumber', da.attempt_number,
            'attemptStartedAtMs', (EXTRACT(EPOCH FROM da.started_at) * 1000)::bigint,
            'attemptCompletedAtMs', (EXTRACT(EPOCH FROM da.completed_at) * 1000)::bigint,
            'attemptOutcome', da.outcome,
            'httpStatus', da.http_status,
            'checkpointCursor', pc.cursor,
            'checkpointVersion', pc.version,
            'pageItemCount', (
                SELECT COUNT(*)
                FROM inbound_deliveries page_delivery
                WHERE page_delivery.connector_id = d.connector_id
            )
        )::text
        FROM inbound_deliveries d
        JOIN delivery_attempts da ON da.delivery_id = d.id
        JOIN polling_checkpoints pc ON pc.connector_id = d.connector_id
        WHERE d.external_event_id = 'chg-demo-001'
        ORDER BY da.attempt_number DESC
        LIMIT 1;
    "
}

read_core_evidence() {
    flow_trace_core_sql "
        SELECT json_build_object(
            'correlationId', received.correlation_id,
            'orderReceivedAtMs', (EXTRACT(EPOCH FROM received.occurred_at) * 1000)::bigint,
            'receivedStatus', received.to_status,
            'outboxPublishedAtMs', (EXTRACT(EPOCH FROM published.published_at) * 1000)::bigint,
            'publishedEventType', published.event_type,
            'processingStartedAtMs', (EXTRACT(EPOCH FROM attempt.started_at) * 1000)::bigint,
            'processingCompletedAtMs', (EXTRACT(EPOCH FROM attempt.completed_at) * 1000)::bigint,
            'attemptNumber', attempt.attempt_number,
            'orderStatus', o.status
        )::text
        FROM orders o
        JOIN LATERAL (
            SELECT correlation_id, occurred_at, to_status
            FROM integration_events
            WHERE order_id = o.id AND event_type = 'ORDER_RECEIVED'
            LIMIT 1
        ) received ON true
        JOIN LATERAL (
            SELECT event_type, published_at
            FROM outbox_events
            WHERE aggregate_id = o.id AND event_type = 'OrderReceived'
            LIMIT 1
        ) published ON true
        JOIN LATERAL (
            SELECT attempt_number, started_at, completed_at
            FROM processing_attempts
            WHERE order_id = o.id AND status = 'SUCCEEDED'
            ORDER BY attempt_number DESC
            LIMIT 1
        ) attempt ON true
        WHERE o.external_order_id = 'ERP-DEMO-001';
    "
}

write_flow_trace() {
    local provider_evidence=$1 gateway_evidence=$2 core_evidence=$3 captured_at=$4
    local temporary_file="${OUTPUT_FILE}.tmp"

    jq --null-input \
        --arg capturedAt "$captured_at" \
        --argjson provider "$provider_evidence" \
        --argjson gateway "$gateway_evidence" \
        --argjson core "$core_evidence" \
        --from-file "$FLOW_TRACE_ROOT_DIR/scripts/flow-traces/erp-b-success.jq" >"$temporary_file"

    mv "$temporary_file" "$OUTPUT_FILE"
}

trap flow_trace_cleanup EXIT

flow_trace_require_commands curl docker jq sed
flow_trace_build_and_start_core
flow_trace_provision_source_credential

printf 'Starting isolated SUCCESS polling and delivery path...\n'
flow_trace_compose up --build --detach --wait --wait-timeout 180 connector-gateway
flow_trace_wait_for "delivered and processed ERP_B order" success_evidence_is_ready

provider_evidence="$(flow_trace_read_provider_evidence)"
gateway_evidence="$(read_gateway_evidence)"
core_evidence="$(read_core_evidence)"
captured_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

write_flow_trace "$provider_evidence" "$gateway_evidence" "$core_evidence" "$captured_at"

flow_trace_validate_artifacts

printf 'Captured ERP_B success FlowTrace at %s.\n' "$OUTPUT_FILE"
