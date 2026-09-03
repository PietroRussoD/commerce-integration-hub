#!/usr/bin/env bash

set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/flow-traces/capture-common.sh"

readonly OUTPUT_FILE="$FLOW_TRACE_ROOT_DIR/apps/operator-console/public/flow-traces/v1/erp-b-authentication-rejection.json"

export CONNECTOR_GATEWAY_ERP_B_API_TOKEN=invalid-local-erp-b-token
export PROVIDER_SIMULATOR_ERP_B_SCENARIO=SUCCESS

blocked_evidence_is_ready() {
    local core_untouched gateway_blocked
    gateway_blocked="$(flow_trace_gateway_sql "
        SELECT EXISTS (
            SELECT 1
            FROM connector_configurations c
            JOIN polling_checkpoints pc ON pc.connector_id = c.id
            WHERE c.provider = 'ERP_B'
              AND c.status = 'BLOCKED_CONFIGURATION'
              AND c.version = 2
              AND pc.cursor IS NULL
              AND pc.version = 1
              AND pc.lease_owner IS NULL
              AND pc.lease_token IS NULL
              AND pc.lease_expires_at IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM inbound_deliveries d WHERE d.connector_id = c.id
              )
        );
    ")"
    core_untouched="$(flow_trace_core_sql "SELECT NOT EXISTS (SELECT 1 FROM orders);")"
    [[ "$gateway_blocked" == "t" && "$core_untouched" == "t" ]]
}

read_gateway_evidence() {
    flow_trace_gateway_sql "
        SELECT json_build_object(
            'connectorBlockedAtMs', (EXTRACT(EPOCH FROM c.updated_at) * 1000)::bigint,
            'connectorState', c.status,
            'connectorVersion', c.version,
            'leaseReleasedAtMs', (EXTRACT(EPOCH FROM pc.updated_at) * 1000)::bigint,
            'checkpointCursor', COALESCE(pc.cursor, 'initial'),
            'checkpointVersion', pc.version,
            'deliveryCount', (
                SELECT COUNT(*) FROM inbound_deliveries d WHERE d.connector_id = c.id
            )
        )::text
        FROM connector_configurations c
        JOIN polling_checkpoints pc ON pc.connector_id = c.id
        WHERE c.provider = 'ERP_B'
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
        --from-file "$FLOW_TRACE_ROOT_DIR/scripts/flow-traces/erp-b-authentication-rejection.jq" >"$temporary_file"

    mv "$temporary_file" "$OUTPUT_FILE"
}

trap flow_trace_cleanup EXIT

flow_trace_require_commands curl docker jq sed
flow_trace_build_and_start_core
flow_trace_provision_source_credential

printf 'Starting isolated ERP_B authentication-rejection path...\n'
flow_trace_compose up --build --detach --wait --wait-timeout 180 connector-gateway
flow_trace_wait_for "blocked ERP_B connector without deliveries" blocked_evidence_is_ready

provider_evidence="$(flow_trace_read_provider_evidence)"
gateway_evidence="$(read_gateway_evidence)"
captured_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

write_flow_trace "$provider_evidence" "$gateway_evidence" "$captured_at"

flow_trace_validate_artifacts

printf 'Captured ERP_B authentication-rejection FlowTrace at %s.\n' "$OUTPUT_FILE"
