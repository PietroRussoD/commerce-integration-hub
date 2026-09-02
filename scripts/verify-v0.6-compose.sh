#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_NAME="${SMOKE_PROJECT_NAME:-commerce-integration-hub-smoke}"
readonly KEEP_STACK="${KEEP_SMOKE_STACK:-false}"

: "${INTEGRATION_CORE_PORT:=28080}"
: "${CONNECTOR_GATEWAY_PORT:=28081}"
: "${REDPANDA_CONSOLE_PORT:=28082}"
: "${PROVIDER_SIMULATOR_PORT:=28083}"
: "${GRAFANA_PORT:=23000}"
: "${PROMETHEUS_PORT:=29090}"
: "${POSTGRES_PORT:=25433}"
: "${CONNECTOR_GATEWAY_POSTGRES_PORT:=25434}"
: "${REDPANDA_KAFKA_PORT:=29092}"
: "${REDPANDA_ADMIN_PORT:=29644}"

export CONNECTOR_GATEWAY_ERP_B_POLLING_ENABLED=true
export CONNECTOR_GATEWAY_PORT
export CONNECTOR_GATEWAY_POSTGRES_PORT
export GRAFANA_PORT
export INTEGRATION_CORE_PORT
export POSTGRES_PORT
export PROMETHEUS_PORT
export PROVIDER_SIMULATOR_PORT
export REDPANDA_ADMIN_PORT
export REDPANDA_CONSOLE_PORT
export REDPANDA_KAFKA_PORT

compose() {
    docker compose \
        --project-name "$PROJECT_NAME" \
        --file "$ROOT_DIR/compose.yaml" \
        --profile gateway \
        --profile observability \
        "$@"
}

cleanup() {
    local status=$?
    trap - EXIT
    if [[ "$KEEP_STACK" == "true" ]]; then
        printf 'Smoke stack retained with project name %s.\n' "$PROJECT_NAME"
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
    for ((attempt = 1; attempt <= 30; attempt += 1)); do
        if "$@" >/dev/null 2>&1; then
            printf 'Verified: %s\n' "$description"
            return 0
        fi
        sleep 2
    done
    printf 'Timed out waiting for: %s\n' "$description" >&2
    return 1
}

prometheus_query() {
    curl --fail --silent --show-error --get \
        --data-urlencode "query=$1" \
        "http://127.0.0.1:${PROMETHEUS_PORT}/api/v1/query"
}

application_health_is_ready() {
    curl --fail --silent --show-error "$1" | jq --exit-status '.status == "UP"'
}

prometheus_targets_are_up() {
    prometheus_query 'up{job=~"integration-core|connector-gateway"}' |
        jq --exit-status '
            .status == "success" and
            (.data.result | length == 2) and
            all(.data.result[]; .value[1] == "1")
        '
}

polling_evidence_is_available() {
    prometheus_query 'sum(connector_gateway_erp_b_polling_pages_committed_total)' |
        jq --exit-status '
            .status == "success" and
            (.data.result | length == 1) and
            ((.data.result[0].value[1] | tonumber) >= 2)
        '
}

grafana_is_provisioned() {
    local base_url="http://127.0.0.1:${GRAFANA_PORT}"
    curl --fail --silent --show-error "$base_url/api/datasources/uid/prometheus/health" |
        jq --exit-status '.status == "OK"' >/dev/null &&
        curl --fail --silent --show-error \
            "$base_url/api/dashboards/uid/commerce-integration-hub-operations" |
        jq --exit-status '
            .meta.provisioned == true and
            .dashboard.editable == false and
            (.dashboard.panels | length == 10)
        '
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

printf 'Starting isolated Compose project %s...\n' "$PROJECT_NAME"
compose up --build --detach --wait --wait-timeout 180

wait_for \
    "Integration Core readiness" \
    application_health_is_ready \
    "http://127.0.0.1:${INTEGRATION_CORE_PORT}/health/ready"
wait_for \
    "Connector Gateway readiness" \
    application_health_is_ready \
    "http://127.0.0.1:${CONNECTOR_GATEWAY_PORT}/health/ready"
wait_for "Prometheus targets" prometheus_targets_are_up
wait_for "ERP_B polling evidence" polling_evidence_is_available
wait_for "Grafana datasource and dashboard provisioning" grafana_is_provisioned

printf 'v0.6 Compose smoke test passed.\n'
