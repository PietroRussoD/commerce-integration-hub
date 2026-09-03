#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_NAME="${FLOW_TRACE_PROJECT_NAME:-commerce-integration-hub-flow-trace}"
readonly KEEP_STACK="${KEEP_FLOW_TRACE_STACK:-false}"
readonly OUTPUT_FILE="$ROOT_DIR/apps/operator-console/public/flow-traces/v1/erp-b-success.json"

: "${INTEGRATION_CORE_PORT:=38080}"
: "${CONNECTOR_GATEWAY_PORT:=38081}"
: "${PROVIDER_SIMULATOR_PORT:=38083}"
: "${POSTGRES_PORT:=35433}"
: "${CONNECTOR_GATEWAY_POSTGRES_PORT:=35434}"
: "${REDPANDA_KAFKA_PORT:=39092}"
: "${REDPANDA_ADMIN_PORT:=39644}"

export CONNECTOR_GATEWAY_DELIVERY_WORKER_ENABLED=true
export CONNECTOR_GATEWAY_ERP_B_POLLING_ENABLED=true
export CONNECTOR_GATEWAY_PORT
export CONNECTOR_GATEWAY_POSTGRES_PORT
export INTEGRATION_CORE_PORT
export POSTGRES_PORT
export PROVIDER_SIMULATOR_ERP_B_SCENARIO=SUCCESS
export PROVIDER_SIMULATOR_PORT
export REDPANDA_ADMIN_PORT
export REDPANDA_KAFKA_PORT

compose() {
    docker compose \
        --project-name "$PROJECT_NAME" \
        --file "$ROOT_DIR/compose.yaml" \
        --profile gateway \
        "$@"
}

cleanup() {
    local status=$?
    trap - EXIT
    unset INTEGRATION_CORE_SOURCE_API_KEY
    if [[ "$KEEP_STACK" == "true" ]]; then
        printf 'Flow trace stack retained with project name %s.\n' "$PROJECT_NAME"
    else
        compose down --volumes --remove-orphans >/dev/null 2>&1 || true
    fi
    exit "$status"
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$1" >&2
        exit 1
    fi
}

wait_for() {
    local description=$1
    shift
    local attempt
    for ((attempt = 1; attempt <= 60; attempt += 1)); do
        if "$@" >/dev/null 2>&1; then
            printf 'Verified: %s\n' "$description"
            return 0
        fi
        sleep 2
    done
    printf 'Timed out waiting for: %s\n' "$description" >&2
    return 1
}

gateway_sql() {
    compose exec --no-TTY connector-gateway-postgres \
        psql --username connector_gateway --dbname connector_gateway \
        --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$1"
}

core_sql() {
    compose exec --no-TTY postgres \
        psql --username integration_hub --dbname integration_hub \
        --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$1"
}

core_is_ready() {
    curl --fail --silent --show-error "http://127.0.0.1:${INTEGRATION_CORE_PORT}/health/ready" |
        jq --exit-status '.status == "UP"'
}

success_evidence_is_ready() {
    local order_ready delivery_ready
    order_ready="$(core_sql "
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
    delivery_ready="$(gateway_sql "
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

read_provider_evidence() {
    compose logs --no-color --no-log-prefix provider-simulator |
        jq --slurp --compact-output '
            . as $logs
            | ($logs
                | map(select(
                    .msg == "incoming request"
                    and (.req.url | startswith("/erp-b/v1/orders?limit="))
                ))
                | first) as $request
            | ($logs
                | map(select(.msg == "request completed" and .reqId == $request.reqId))
                | first) as $response
            | if $request == null or $response == null then
                error("ERP_B request evidence not found in provider logs")
              else
                {
                    requestedAtMs: $request.time,
                    completedAtMs: (($request.time + $response.responseTime) | ceil),
                    httpStatus: $response.res.statusCode
                }
              end
        '
}

read_gateway_evidence() {
    gateway_sql "
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
    core_sql "
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
        --from-file "$ROOT_DIR/scripts/flow-traces/erp-b-success.jq" >"$temporary_file"

    mv "$temporary_file" "$OUTPUT_FILE"
}

trap cleanup EXIT

for command in curl docker jq sed; do
    require_command "$command"
done

printf 'Building Integration Core application artifacts...\n'
(
    cd "$ROOT_DIR/services/integration-core"
    ./mvnw --batch-mode --no-transfer-progress package -DskipTests
)

printf 'Starting isolated Core stack %s...\n' "$PROJECT_NAME"
compose up --build --detach --wait --wait-timeout 180 integration-core
wait_for "Integration Core readiness" core_is_ready

printf 'Provisioning an ephemeral source credential...\n'
credential_output="$(
    cd "$ROOT_DIR/services/integration-core"
    export DB_JDBC_URL="jdbc:postgresql://127.0.0.1:${POSTGRES_PORT}/integration_hub"
    export DB_USERNAME=integration_hub
    export DB_PASSWORD=local-development-only
    export INTEGRATION_HUB_SECURITY_SOURCE_CREDENTIAL_PEPPERS="1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    ./mvnw --batch-mode --no-transfer-progress compile exec:java@source-credentials \
        -Dexec.args="provision ERP_B 1"
)"
export INTEGRATION_CORE_SOURCE_API_KEY
INTEGRATION_CORE_SOURCE_API_KEY="$(sed -n 's/^apiKey=//p' <<<"$credential_output")"
if [[ -z "$INTEGRATION_CORE_SOURCE_API_KEY" ]]; then
    printf 'The provisioning command did not return an API key.\n' >&2
    exit 1
fi
unset credential_output

printf 'Starting isolated SUCCESS polling and delivery path...\n'
compose up --build --detach --wait --wait-timeout 180 connector-gateway
wait_for "delivered and processed ERP_B order" success_evidence_is_ready

provider_evidence="$(read_provider_evidence)"
gateway_evidence="$(read_gateway_evidence)"
core_evidence="$(read_core_evidence)"
captured_at="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

write_flow_trace "$provider_evidence" "$gateway_evidence" "$core_evidence" "$captured_at"

printf 'Validating generated FlowTrace...\n'
(
    cd "$ROOT_DIR/apps/operator-console"
    pnpm exec vitest run src/features/flow-explorer/flowTraceArtifacts.test.ts
)

printf 'Captured ERP_B success FlowTrace at %s.\n' "$OUTPUT_FILE"
