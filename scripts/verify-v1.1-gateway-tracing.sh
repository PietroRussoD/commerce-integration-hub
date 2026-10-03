#!/usr/bin/env bash

set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_NAME="${GATEWAY_TRACING_PROJECT_NAME:-commerce-integration-hub-gateway-tracing}"
readonly KEEP_STACK="${KEEP_GATEWAY_TRACING_STACK:-false}"

: "${CONNECTOR_GATEWAY_PORT:=48081}"
: "${CONNECTOR_GATEWAY_POSTGRES_PORT:=45434}"
: "${PROVIDER_SIMULATOR_PORT:=48083}"
: "${JAEGER_UI_PORT:=48686}"

export CONNECTOR_GATEWAY_OTEL_SDK_DISABLED=false
export CONNECTOR_GATEWAY_PORT
export CONNECTOR_GATEWAY_POSTGRES_PORT
export JAEGER_UI_PORT
export PROVIDER_SIMULATOR_PORT

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
        printf 'Gateway tracing stack retained with project name %s.\n' "$PROJECT_NAME"
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

gateway_trace_is_visible() {
    curl --fail --silent --show-error "http://127.0.0.1:${JAEGER_UI_PORT}/api/v3/services" |
        jq --exit-status --arg service connector-gateway '.services | index($service) != null' >/dev/null
}

wait_for_gateway_trace() {
    local attempt
    for ((attempt = 1; attempt <= 30; attempt += 1)); do
        if gateway_trace_is_visible; then
            printf 'Verified: Jaeger received a trace from connector-gateway.\n'
            return 0
        fi
        sleep 1
    done

    printf 'Timed out waiting for connector-gateway traces in Jaeger.\n' >&2
    compose logs --no-color connector-gateway jaeger >&2
    return 1
}

trap cleanup EXIT

for command in curl docker jq; do
    require_command "$command"
done

printf 'Starting an isolated Connector Gateway and Jaeger stack...\n'
compose up --build --detach --wait --wait-timeout 180 connector-gateway jaeger otel-collector

printf 'Calling the Gateway liveness endpoint...\n'
curl --fail --silent --show-error "http://127.0.0.1:${CONNECTOR_GATEWAY_PORT}/health/live" |
    jq --exit-status '.status == "UP"'

wait_for_gateway_trace
printf 'Connector Gateway tracing smoke test passed.\n'
