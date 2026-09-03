#!/usr/bin/env bash

readonly FLOW_TRACE_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly FLOW_TRACE_PROJECT_NAME="${FLOW_TRACE_PROJECT_NAME:-commerce-integration-hub-flow-trace}"
readonly FLOW_TRACE_KEEP_STACK="${KEEP_FLOW_TRACE_STACK:-false}"

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
export PROVIDER_SIMULATOR_PORT
export REDPANDA_ADMIN_PORT
export REDPANDA_KAFKA_PORT

flow_trace_compose() {
    docker compose \
        --project-name "$FLOW_TRACE_PROJECT_NAME" \
        --file "$FLOW_TRACE_ROOT_DIR/compose.yaml" \
        --profile gateway \
        "$@"
}

flow_trace_cleanup() {
    local status=$?
    trap - EXIT
    unset INTEGRATION_CORE_SOURCE_API_KEY
    if [[ "$FLOW_TRACE_KEEP_STACK" == "true" ]]; then
        printf 'Flow trace stack retained with project name %s.\n' "$FLOW_TRACE_PROJECT_NAME"
    else
        flow_trace_compose down --volumes --remove-orphans >/dev/null 2>&1 || true
    fi
    exit "$status"
}

flow_trace_require_commands() {
    local command
    for command in "$@"; do
        if ! command -v "$command" >/dev/null 2>&1; then
            printf 'Required command not found: %s\n' "$command" >&2
            exit 1
        fi
    done
}

flow_trace_wait_for() {
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

flow_trace_gateway_sql() {
    flow_trace_compose exec --no-TTY connector-gateway-postgres \
        psql --username connector_gateway --dbname connector_gateway \
        --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$1"
}

flow_trace_core_sql() {
    flow_trace_compose exec --no-TTY postgres \
        psql --username integration_hub --dbname integration_hub \
        --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$1"
}

flow_trace_core_is_ready() {
    curl --fail --silent --show-error "http://127.0.0.1:${INTEGRATION_CORE_PORT}/health/ready" |
        jq --exit-status '.status == "UP"'
}

flow_trace_read_provider_evidence() {
    flow_trace_compose logs --no-color --no-log-prefix provider-simulator |
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

flow_trace_build_and_start_core() {
    printf 'Building Integration Core application artifacts...\n'
    (
        cd "$FLOW_TRACE_ROOT_DIR/services/integration-core"
        ./mvnw --batch-mode --no-transfer-progress package -DskipTests
    )

    printf 'Starting isolated Core stack %s...\n' "$FLOW_TRACE_PROJECT_NAME"
    flow_trace_compose up --build --detach --wait --wait-timeout 180 integration-core
    flow_trace_wait_for "Integration Core readiness" flow_trace_core_is_ready
}

flow_trace_provision_source_credential() {
    local credential_output
    printf 'Provisioning an ephemeral source credential...\n'
    credential_output="$(
        cd "$FLOW_TRACE_ROOT_DIR/services/integration-core"
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
}

flow_trace_validate_artifacts() {
    printf 'Validating generated FlowTrace artifacts...\n'
    (
        cd "$FLOW_TRACE_ROOT_DIR/apps/operator-console"
        pnpm exec vitest run src/features/flow-explorer/flowTraceArtifacts.test.ts
    )
}
