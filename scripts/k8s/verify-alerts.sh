#!/usr/bin/env bash

# Causes two real failures and checks that the matching alert reaches
# Alertmanager, then undoes them:
#
#   no-targets  scales the Integration Core to zero replicas: HubNoTargets
#   bad-image   rolls out a Connector Gateway image that does not exist, so the
#               new pod exists but cannot be scraped: HubTargetDown
#
# The healthy replicas keep serving during the second scenario, and the failed
# rollout is undone. Run scripts/k8s/observability.sh first.
#
# Usage: scripts/k8s/verify-alerts.sh [no-targets|bad-image]   (default: both)

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly WAIT_SECONDS="${VERIFY_WAIT_SECONDS:-300}"
readonly ALERTMANAGER_PORT=19093

require_command curl
require_command python3
observability_installed || fail "The observability stack is not installed: run scripts/k8s/observability.sh first."

undo=""

cleanup() {
    [[ -n "$undo" ]] && eval "$undo" >/dev/null 2>&1 || true
    stop_port_forwards
}
trap cleanup EXIT

start_port_forward observability svc/alertmanager "$ALERTMANAGER_PORT:9093"
for ((attempt = 0; attempt < 20; attempt += 1)); do
    curl --silent --output /dev/null "http://127.0.0.1:$ALERTMANAGER_PORT/-/ready" && break
    sleep 1
done

# The names of the alerts that are active in Alertmanager, one per line.
active_alerts() {
    curl --silent "http://127.0.0.1:$ALERTMANAGER_PORT/api/v2/alerts" | python3 -c '
import json, sys
for alert in json.load(sys.stdin):
    if alert["status"]["state"] == "active":
        print(alert["labels"]["alertname"])'
}

# Waits for an alert that was not active before the failure was caused.
wait_for_alert() {
    local alert=$1 started=$SECONDS
    while ((SECONDS - started < WAIT_SECONDS)); do
        if active_alerts | grep -qx "$alert"; then
            printf '  ok    %s reached Alertmanager after %d s\n' "$alert" "$((SECONDS - started))"
            return 0
        fi
        sleep 5
    done
    printf '  FAIL  %s did not reach Alertmanager within %d s\n' "$alert" "$WAIT_SECONDS"
    return 1
}

# Waits for an alert to stop being active, so that a scenario starts clean.
wait_until_clear() {
    local alert=$1 started=$SECONDS
    while ((SECONDS - started < WAIT_SECONDS)); do
        active_alerts | grep -qx "$alert" || return 0
        sleep 5
    done
    printf '  note  %s is still active after %d s; the next check may be affected\n' "$alert" "$WAIT_SECONDS"
}

failures=0

no_targets() {
    printf 'No Core replica exists.\n'
    wait_until_clear HubNoTargets
    undo="kube -n $APP_NAMESPACE scale deployment/integration-core --replicas=2"
    kube -n "$APP_NAMESPACE" scale deployment/integration-core --replicas=0 >/dev/null
    wait_for_alert HubNoTargets || failures=$((failures + 1))
    eval "$undo" >/dev/null
    undo=""
    wait_for_rollout "$APP_NAMESPACE" integration-core 300s >/dev/null
    printf '  Core back to two replicas.\n'
}

bad_image() {
    printf 'A Gateway rollout with an image that does not exist.\n'
    wait_until_clear HubTargetDown
    undo="kube -n $APP_NAMESPACE rollout undo deployment/connector-gateway"
    kube -n "$APP_NAMESPACE" set image deployment/connector-gateway \
        connector-gateway=hub-local/connector-gateway:does-not-exist >/dev/null
    wait_for_alert HubTargetDown || failures=$((failures + 1))
    eval "$undo" >/dev/null
    undo=""
    wait_for_rollout "$APP_NAMESPACE" connector-gateway 300s >/dev/null
    printf '  Gateway rollout undone.\n'
}

case "${1:-all}" in
no-targets) no_targets ;;
bad-image) bad_image ;;
all)
    no_targets
    bad_image
    ;;
*) fail "Unknown scenario: $1 (use no-targets or bad-image)." ;;
esac

if ((failures > 0)); then
    fail "$failures alert(s) did not arrive."
fi
printf 'Verified: the alerts reached Alertmanager.\n'
