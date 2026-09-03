#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/flow-traces/capture-common.sh"

readonly OUTPUT_FILE="$FLOW_TRACE_ROOT_DIR/apps/operator-console/public/flow-traces/v1/erp-b-poison-item.json"

export PROVIDER_SIMULATOR_ERP_B_SCENARIO=POISON_ITEM

poison_evidence_is_ready() {
    local core_untouched gateway_rejection_ready
    gateway_rejection_ready="$(flow_trace_gateway_sql "
        SELECT EXISTS (
            SELECT 1
            FROM inbound_deliveries d
            JOIN polling_checkpoints pc ON pc.connector_id = d.connector_id
            WHERE d.external_event_id = 'chg-demo-002'
              AND d.status = 'PERMANENT_FAILURE'
              AND d.error_code = 'ERP_B_UNSUPPORTED_CURRENCY'
              AND d.canonical_payload IS NULL
              AND pc.cursor = 'cursor-1'
              AND NOT EXISTS (
                  SELECT 1 FROM delivery_attempts da WHERE da.delivery_id = d.id
              )
        );
    ")"
    core_untouched="$(flow_trace_core_sql "
        SELECT NOT EXISTS (
            SELECT 1 FROM orders WHERE external_order_id = 'ERP-DEMO-002'
        );
    ")"
    [[ "$gateway_rejection_ready" == "t" && "$core_untouched" == "t" ]]
}

read_gateway_evidence() {
    flow_trace_gateway_sql "
        SELECT json_build_object(
            'deliveryRecordedAtMs', (EXTRACT(EPOCH FROM d.received_at) * 1000)::bigint,
            'deliveryState', d.status,
            'errorCode', d.error_code,
            'checkpointCursor', pc.cursor,
            'checkpointVersion', pc.version,
            'pageItemCount', (
                SELECT COUNT(*)
                FROM inbound_deliveries page_delivery
                WHERE page_delivery.connector_id = d.connector_id
            ),
            'deliveryAttemptCount', (
                SELECT COUNT(*)
                FROM delivery_attempts da
                WHERE da.delivery_id = d.id
            )
        )::text
        FROM inbound_deliveries d
        JOIN polling_checkpoints pc ON pc.connector_id = d.connector_id
        WHERE d.external_event_id = 'chg-demo-002'
        LIMIT 1;
    "
}

write_flow_trace() {
    local provider_evidence=$1 gateway_evidence=$2 captured_at=$3
    local temporary_file="${OUTPUT_FILE}.tmp"

    jq --null-input \
        --arg capturedAt "$captured_at" \
        --argjson provider "$provider_evidence" \
        --argjson gateway "$gateway_evidence" \
        --from-file "$FLOW_TRACE_ROOT_DIR/scripts/flow-traces/erp-b-poison-item.jq" >"$temporary_file"

    mv "$temporary_file" "$OUTPUT_FILE"
}

trap flow_trace_cleanup EXIT

flow_trace_require_commands curl docker jq sed
flow_trace_build_and_start_core
flow_trace_provision_source_credential

printf 'Starting isolated POISON_ITEM polling path...\n'
flow_trace_compose up --build --detach --wait --wait-timeout 180 connector-gateway
flow_trace_wait_for "durable ERP_B poison rejection without Core delivery" poison_evidence_is_ready

provider_evidence="$(flow_trace_read_provider_evidence)"
gateway_evidence="$(read_gateway_evidence)"
captured_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

write_flow_trace "$provider_evidence" "$gateway_evidence" "$captured_at"

flow_trace_validate_artifacts

printf 'Captured ERP_B poison-item FlowTrace at %s.\n' "$OUTPUT_FILE"
