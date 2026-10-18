#!/usr/bin/env bash

# Shared helpers for the local Kubernetes scripts. Source this file; do not run it.
#
# Every cluster command goes through kube, helm_cmd and kind_with_kubeconfig. They use this
# environment's own kubeconfig and refuse to run unless it points at a local kind
# cluster, so a script can never act on another cluster. The default kubeconfig
# (~/.kube/config) and the default Helm repositories are neither read nor written.

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DEPLOY_DIR="$ROOT_DIR/deploy"

# shellcheck source=deploy/versions.env
source "$DEPLOY_DIR/versions.env"

readonly CLUSTER_NAME="${HUB_CLUSTER_NAME:-hub}"
readonly KUBE_CONTEXT="kind-${CLUSTER_NAME}"
readonly HUB_KUBECONFIG="${HUB_KUBECONFIG:-$HOME/.kube/hub-local.yaml}"

# Helm keeps repositories and caches here instead of in the user's own folders.
readonly HUB_HELM_HOME="${HUB_HELM_HOME:-$HOME/.cache/commerce-integration-hub/helm}"
export HELM_CONFIG_HOME="$HUB_HELM_HOME/config"
export HELM_CACHE_HOME="$HUB_HELM_HOME/cache"
export HELM_DATA_HOME="$HUB_HELM_HOME/data"

readonly APP_NAMESPACE=hub
readonly DATA_NAMESPACE=hub-data

fail() {
    printf '%s\n' "$*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

# A path as an absolute one, without requiring it to exist.
absolute_path() {
    local directory
    directory="$(cd "$(dirname "$1")" 2>/dev/null && pwd -P)" || directory="$(dirname "$1")"
    printf '%s/%s' "$directory" "$(basename "$1")"
}

refuse_default_kubeconfig() {
    local candidate
    candidate="$(absolute_path "$HUB_KUBECONFIG")"
    if [[ "$candidate" == "$(absolute_path "$HOME/.kube/config")" ]]; then
        fail "HUB_KUBECONFIG must not be the default kubeconfig (~/.kube/config)."
    fi
}

GUARD_PASSED=false

# Passes only when the environment's kubeconfig has the expected context and that
# context talks to the local machine.
assert_local_cluster() {
    [[ "$GUARD_PASSED" == "true" ]] && return 0
    refuse_default_kubeconfig
    [[ -f "$HUB_KUBECONFIG" ]] || fail "No kubeconfig at $HUB_KUBECONFIG: run scripts/k8s/up.sh first."
    local server
    server="$(kubectl --kubeconfig "$HUB_KUBECONFIG" --context "$KUBE_CONTEXT" \
        config view --minify -o 'jsonpath={.clusters[0].cluster.server}' 2>/dev/null)" ||
        fail "Context $KUBE_CONTEXT not found in $HUB_KUBECONFIG."
    case "$server" in
    https://127.0.0.1:* | https://localhost:* | 'https://[::1]:'*) ;;
    *) fail "Refusing to run: context $KUBE_CONTEXT points at $server, not at a local cluster." ;;
    esac
    GUARD_PASSED=true
}

kube() {
    assert_local_cluster
    kubectl --kubeconfig "$HUB_KUBECONFIG" --context "$KUBE_CONTEXT" "$@"
}

helm_cmd() {
    assert_local_cluster
    helm --kubeconfig "$HUB_KUBECONFIG" --kube-context "$KUBE_CONTEXT" "$@"
}

# kind itself only ever writes to the environment's kubeconfig. Without
# --kubeconfig, creating or deleting a cluster would edit ~/.kube/config.
kind_with_kubeconfig() {
    refuse_default_kubeconfig
    kind "$@" --name "$CLUSTER_NAME" --kubeconfig "$HUB_KUBECONFIG"
}

# Port-forwards started by start_port_forward, stopped by stop_port_forwards.
PORT_FORWARD_PIDS=()

# Starts a port-forward to 127.0.0.1 in the background. kubectl is started here
# directly, so that the recorded process is kubectl itself: backgrounding the
# `kube` function would record a subshell and leave kubectl running.
#
# Usage: start_port_forward <namespace> <resource> <local-port>:<remote-port>
start_port_forward() {
    assert_local_cluster
    kubectl --kubeconfig "$HUB_KUBECONFIG" --context "$KUBE_CONTEXT" -n "$1" \
        port-forward --address 127.0.0.1 "$2" "$3" >/dev/null 2>&1 &
    PORT_FORWARD_PIDS+=("$!")
}

stop_port_forwards() {
    local pid
    for pid in "${PORT_FORWARD_PIDS[@]:-}"; do
        [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    done
    PORT_FORWARD_PIDS=()
}

istio_cmd() {
    assert_local_cluster
    istioctl --kubeconfig "$HUB_KUBECONFIG" --context "$KUBE_CONTEXT" "$@"
}

# Whether the service mesh and its ingress are installed.
mesh_installed() {
    assert_local_cluster
    kube -n hub-ingress get gateway hub-ingress >/dev/null 2>&1
}

kind_load_image() {
    kind load docker-image "$1" --name "$CLUSTER_NAME"
}

# Whether the Gateway has a source credential to forward with.
source_key_exists() {
    # Checked first, outside the redirection below, so that a refusal is explained.
    assert_local_cluster
    kube -n "$APP_NAMESPACE" get secret gateway-source-key >/dev/null 2>&1
}

# Whether the observability stack is installed.
observability_installed() {
    assert_local_cluster
    kube -n observability get deployment otel-collector >/dev/null 2>&1
}

# Installs or upgrades the chart. The delivery worker runs exactly when the source
# credential exists, and tracing exactly when the observability stack is
# installed. Other saved values, including the protected operator profile, are
# preserved while new chart defaults are incorporated.
install_chart() {
    local worker=false tracing=false
    if source_key_exists; then
        worker=true
    fi
    if observability_installed; then
        tracing=true
    fi
    helm_cmd upgrade --install hub "$DEPLOY_DIR/charts/commerce-integration-hub" \
        --namespace "$APP_NAMESPACE" --create-namespace --wait --timeout 10m \
        --reset-then-reuse-values \
        --set "connectorGateway.deliveryWorker.enabled=$worker" \
        --set "tracing.enabled=$tracing" "$@"
}

cluster_exists() {
    kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"
}

# Waits for a Deployment to finish rolling out, with a clear message on timeout.
wait_for_rollout() {
    kube -n "$1" rollout status "deployment/$2" --timeout="${3:-300s}" ||
        fail "Deployment $1/$2 did not become ready."
}
