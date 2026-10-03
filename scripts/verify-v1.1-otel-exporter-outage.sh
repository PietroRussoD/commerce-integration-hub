#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_NAME="${OTEL_OUTAGE_PROJECT_NAME:-commerce-integration-hub-otel-outage}"
readonly KEEP_STACK="${KEEP_OTEL_OUTAGE_STACK:-false}"

: "${INTEGRATION_CORE_PORT:=48080}"
: "${POSTGRES_PORT:=45433}"
: "${REDPANDA_KAFKA_PORT:=49092}"
: "${REDPANDA_ADMIN_PORT:=49644}"

export INTEGRATION_CORE_PORT
export OTEL_SDK_DISABLED=false
export POSTGRES_PORT
export REDPANDA_ADMIN_PORT
export REDPANDA_KAFKA_PORT

compose() {
    docker compose \
        --project-name "$PROJECT_NAME" \
        --file "$ROOT_DIR/compose.yaml" \
        --profile observability \
        "$@"
}

cleanup() {
    local status=$?
    trap - EXIT
    if [[ "$KEEP_STACK" == "true" ]]; then
        printf 'Outage test stack retained with project name %s.\n' "$PROJECT_NAME"
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

outage_is_observed_without_rejecting_the_request() {
    local logs
    logs="$(compose logs --no-color --no-log-prefix integration-core 2>/dev/null)"

    printf '%s\n' "$logs" | jq --exit-status --arg path "$1" '
        select(
            .loggerName == "dev.pietrorussod.integrationhub.api.correlation.CorrelationIdFilter" and
            .mdc.httpPath == $path and
            .mdc.httpStatus == "200" and
            .mdc.sampled == "true" and
            (.mdc.traceId | length == 32)
        )
    ' >/dev/null &&
        printf '%s\n' "$logs" | jq --exit-status '
            select((.message // "") | contains("Failed to export TraceRequestMarshaler."))
        ' >/dev/null
}

wait_for_export_failure() {
    local attempt
    for ((attempt = 1; attempt <= 30; attempt += 1)); do
        if outage_is_observed_without_rejecting_the_request "$1"; then
            printf 'Verified: the request succeeded and its OTLP export failed asynchronously.\n'
            return 0
        fi
        sleep 1
    done

    printf 'Timed out waiting for the sampled request and failed OTLP export evidence.\n' >&2
    compose logs --no-color integration-core >&2
    return 1
}

trap cleanup EXIT

for command in curl docker jq; do
    require_command "$command"
done

printf 'Building Integration Core application artifacts...\n'
(
    cd "$ROOT_DIR/services/integration-core"
    ./mvnw --batch-mode --no-transfer-progress package -DskipTests
)

printf 'Starting isolated Core stack without starting Jaeger...\n'
compose up --build --detach --wait --wait-timeout 180 integration-core

printf 'Calling the operator orders read endpoint...\n'
curl --fail --silent --show-error "http://127.0.0.1:${INTEGRATION_CORE_PORT}/api/v1/operator/orders" |
    jq --exit-status '
        (.items | type == "array") and
        (.limit == 25) and
        (.total | type == "number")
    '

wait_for_export_failure "/api/v1/operator/orders"
printf 'OpenTelemetry exporter outage smoke test passed.\n'
