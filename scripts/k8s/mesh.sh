#!/usr/bin/env bash

# Installs, or removes, the service mesh of the local Kubernetes environment:
# Istio in ambient mode, strict mutual TLS and authorization by workload identity
# in the application namespace, and a Gateway API ingress for the APIs.
#
# The application and observability namespaces join the mesh; the data
# namespace (PostgreSQL, Redpanda) stays out of it. There is no waypoint yet, so
# the mesh works at layer 4 only and cannot retry HTTP requests: retries stay in
# the applications (ADR 0023).
#
# Usage:
#   scripts/k8s/mesh.sh          install (or update)
#   scripts/k8s/mesh.sh remove   remove the mesh and the ingress

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly MESH_DIR="$DEPLOY_DIR/mesh"
readonly MESHED_NAMESPACES=("$APP_NAMESPACE" observability)

require_command istioctl
require_command kubectl

check_istioctl_version() {
    local version
    version="$(istioctl version --remote=false 2>/dev/null | sed -n 's/^client version: //p')"
    [[ "$version" == "$ISTIO_VERSION" ]] ||
        fail "istioctl is $version, but this environment pins Istio $ISTIO_VERSION (deploy/versions.env)."
}

# Restarts the pods of the meshed namespaces, so that no connection opened
# before they joined the mesh is still in use.
restart_meshed_workloads() {
    local namespace
    for namespace in "${MESHED_NAMESPACES[@]}"; do
        if kube get namespace "$namespace" >/dev/null 2>&1; then
            kube -n "$namespace" rollout restart deployment >/dev/null 2>&1 || true
        fi
    done
    for namespace in "${MESHED_NAMESPACES[@]}"; do
        kube get namespace "$namespace" >/dev/null 2>&1 || continue
        local deployment
        for deployment in $(kube -n "$namespace" get deployment -o name); do
            kube -n "$namespace" rollout status "$deployment" --timeout=300s >/dev/null ||
                fail "$namespace/$deployment did not become ready in the mesh."
        done
    done
}

install_mesh() {
    check_istioctl_version
    printf 'Installing the Gateway API CRDs %s.\n' "$GATEWAY_API_VERSION"
    kube apply --server-side -f \
        "https://github.com/kubernetes-sigs/gateway-api/releases/download/$GATEWAY_API_VERSION/standard-install.yaml" >/dev/null

    printf 'Installing Istio %s in ambient mode.\n' "$ISTIO_VERSION"
    local log
    log="$(mktemp)"
    istio_cmd install --set profile=ambient --skip-confirmation >"$log" 2>&1 || {
        cat "$log" >&2
        fail "Istio could not be installed."
    }
    rm -f "$log"

    local namespace
    for namespace in "${MESHED_NAMESPACES[@]}"; do
        if kube get namespace "$namespace" >/dev/null 2>&1; then
            kube label namespace "$namespace" istio.io/dataplane-mode=ambient --overwrite >/dev/null
        fi
    done

    printf 'Applying mutual TLS, authorization and the ingress.\n'
    kube apply -f "$MESH_DIR/peer-authentication.yaml" -f "$MESH_DIR/authorization.yaml" >/dev/null
    kube apply -f "$MESH_DIR/ingress.yaml" >/dev/null
    kube -n hub-ingress wait --for=condition=Programmed gateway/hub-ingress --timeout=180s >/dev/null ||
        fail "The ingress gateway was not programmed."

    printf 'Restarting the meshed workloads.\n'
    restart_meshed_workloads
}

remove_mesh() {
    kube delete -f "$MESH_DIR/ingress.yaml" --ignore-not-found >/dev/null
    kube delete -f "$MESH_DIR/authorization.yaml" -f "$MESH_DIR/peer-authentication.yaml" --ignore-not-found >/dev/null
    local namespace
    for namespace in "${MESHED_NAMESPACES[@]}"; do
        kube label namespace "$namespace" istio.io/dataplane-mode- >/dev/null 2>&1 || true
    done
    istio_cmd uninstall --purge --skip-confirmation >/dev/null 2>&1 || fail "Istio could not be uninstalled."
    restart_meshed_workloads
}

case "${1:-install}" in
install)
    install_mesh
    cat <<'TEXT'
The mesh is running. The APIs are reachable through the ingress:

  export KUBECONFIG="$HOME/.kube/hub-local.yaml"
  kubectl -n hub-ingress port-forward svc/hub-ingress-istio 8080:80

Then scripts/k8s/smoke.sh and scripts/k8s/verify-mesh.sh.
TEXT
    ;;
remove) remove_mesh ;;
*) fail "Unknown command: $1 (use install or remove)." ;;
esac
