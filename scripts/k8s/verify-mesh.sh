#!/usr/bin/env bash

# Verifies the service mesh: that the applications are in it, that the allowed
# callers get through, and that everybody else is refused.
#
#   - every application and observability pod speaks HBONE (mutual TLS);
#   - a pod outside the mesh cannot reach the Core (strict mutual TLS);
#   - a pod inside the mesh with an identity nobody allowed cannot reach the Core,
#     the Gateway or the simulator (authorization);
#   - the test identity reaches the Core and the Gateway, not the simulator;
#   - the Gateway reaches the Core, and Prometheus still scrapes every replica;
#   - the ingress routes the APIs and not the health or metrics endpoints.
#
# Run scripts/k8s/mesh.sh first.
#
# Usage: scripts/k8s/verify-mesh.sh

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly PROBE_NAMESPACE=hub-mesh-probe
readonly INGRESS_PORT=18085
readonly PROMETHEUS_PORT=19095

require_command curl
require_command python3
mesh_installed || fail "The mesh is not installed: run scripts/k8s/mesh.sh first."

cleanup() {
    stop_port_forwards
    kube -n "$APP_NAMESPACE" delete pod mesh-probe-test-client mesh-probe-intruder --ignore-not-found --wait=false >/dev/null 2>&1 || true
    kube -n "$APP_NAMESPACE" delete serviceaccount hub-mesh-intruder --ignore-not-found >/dev/null 2>&1 || true
    kube delete namespace "$PROBE_NAMESPACE" --ignore-not-found --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

failures=0

check() {
    local description=$1 expected=$2 actual=$3
    if [[ "$actual" == "$expected" ]]; then
        printf '  ok    %s: %s\n' "$description" "$actual"
    else
        printf '  FAIL  %s: expected %s, got %s\n' "$description" "$expected" "$actual"
        failures=$((failures + 1))
    fi
}

# A pod that only waits, from which requests are made.
start_probe() {
    local namespace=$1 name=$2 service_account=$3
    kube -n "$namespace" apply -f - >/dev/null <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: $name
  labels: { app.kubernetes.io/name: mesh-probe }
spec:
  serviceAccountName: $service_account
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: probe
      image: curlimages/curl:8.17.0
      command: ["sleep", "3600"]
      resources: { limits: { memory: 32Mi } }
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: [ALL] }
YAML
    kube -n "$namespace" wait --for=condition=Ready "pod/$name" --timeout=180s >/dev/null ||
        fail "Probe pod $namespace/$name did not start."
}

# "allowed" when an HTTP response comes back, "refused" when the connection is
# cut before one does.
reach() {
    local namespace=$1 pod=$2 url=$3 code
    code="$(kube -n "$namespace" exec "$pod" -- curl --silent --output /dev/null --max-time 5 \
        --write-out '%{http_code}' "$url" 2>/dev/null || true)"
    if [[ "$code" =~ ^[1-5][0-9][0-9]$ ]]; then
        printf 'allowed'
    else
        printf 'refused'
    fi
}

readonly CORE_URL="http://integration-core.$APP_NAMESPACE:8080/health/ready"
readonly GATEWAY_URL="http://connector-gateway.$APP_NAMESPACE:8081/health/ready"
readonly SIMULATOR_URL="http://provider-simulator.$APP_NAMESPACE:8080/health"

printf 'Mesh membership.\n'
workloads="$(istio_cmd ztunnel-config workloads 2>/dev/null)"
for namespace in "$APP_NAMESPACE" observability; do
    running="$(kube -n "$namespace" get pods --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')"
    hbone="$(printf '%s\n' "$workloads" | awk -v ns="$namespace" '$1 == ns && $NF == "HBONE"' | wc -l | tr -d ' ')"
    check "running pods in $namespace that speak HBONE" "$running" "$hbone"
done

printf 'Callers outside and inside the mesh.\n'
# Probes left by an earlier run may still be going away.
kube -n "$APP_NAMESPACE" delete pod mesh-probe-test-client mesh-probe-intruder --ignore-not-found --wait >/dev/null
kube delete namespace "$PROBE_NAMESPACE" --ignore-not-found --wait >/dev/null
kube create namespace "$PROBE_NAMESPACE" --dry-run=client -o yaml | kube apply -f - >/dev/null
kube -n "$APP_NAMESPACE" create serviceaccount hub-mesh-intruder --dry-run=client -o yaml | kube apply -f - >/dev/null
start_probe "$PROBE_NAMESPACE" outside default
start_probe "$APP_NAMESPACE" mesh-probe-intruder hub-mesh-intruder
start_probe "$APP_NAMESPACE" mesh-probe-test-client hub-test-client

check "a pod outside the mesh calling the Core" refused "$(reach "$PROBE_NAMESPACE" outside "$CORE_URL")"
check "an identity nobody allowed calling the Core" refused "$(reach "$APP_NAMESPACE" mesh-probe-intruder "$CORE_URL")"
check "an identity nobody allowed calling the Gateway" refused "$(reach "$APP_NAMESPACE" mesh-probe-intruder "$GATEWAY_URL")"
check "an identity nobody allowed calling the simulator" refused "$(reach "$APP_NAMESPACE" mesh-probe-intruder "$SIMULATOR_URL")"
check "the test identity calling the Core" allowed "$(reach "$APP_NAMESPACE" mesh-probe-test-client "$CORE_URL")"
check "the test identity calling the Gateway" allowed "$(reach "$APP_NAMESPACE" mesh-probe-test-client "$GATEWAY_URL")"
check "the test identity calling the simulator" refused "$(reach "$APP_NAMESPACE" mesh-probe-test-client "$SIMULATOR_URL")"

# The Gateway image has no curl; its own Node.js makes the request.
gateway_to_core="$(kube -n "$APP_NAMESPACE" exec deploy/connector-gateway -c connector-gateway -- \
    /nodejs/bin/node -e "fetch('$CORE_URL').then(r => console.log(r.status)).catch(() => console.log('refused'))" 2>/dev/null || true)"
check "the Gateway calling the Core" 200 "$gateway_to_core"

printf 'Prometheus inside the mesh.\n'
start_port_forward observability svc/prometheus "$PROMETHEUS_PORT:9090"
for ((attempt = 0; attempt < 20; attempt += 1)); do
    curl --silent --output /dev/null "http://127.0.0.1:$PROMETHEUS_PORT/-/ready" && break
    sleep 1
done
targets="$(curl --silent "http://127.0.0.1:$PROMETHEUS_PORT/api/v1/targets" | python3 -c '
import json, sys
targets = json.load(sys.stdin)["data"]["activeTargets"]
up = sum(target["health"] == "up" for target in targets)
print(f"{up}/{len(targets)}")')"
expected_targets="$(kube -n "$APP_NAMESPACE" get pods -l 'app.kubernetes.io/name in (integration-core,connector-gateway)' \
    --field-selector=status.phase=Running --no-headers | wc -l | tr -d ' ')"
check "application replicas Prometheus scrapes successfully" "$expected_targets/$expected_targets" "$targets"

printf 'The ingress.\n'
start_port_forward hub-ingress svc/hub-ingress-istio "$INGRESS_PORT:80"
for ((attempt = 0; attempt < 20; attempt += 1)); do
    curl --silent --output /dev/null "http://127.0.0.1:$INGRESS_PORT/" && break
    sleep 1
done
status_of() {
    curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$INGRESS_PORT$1"
}
check "the Core health endpoint through the ingress" 404 "$(status_of /health/ready)"
check "the Gateway metrics through the ingress" 404 "$(status_of /metrics)"
# Without a key the Core answers 401: the request reached it.
check "an order lookup through the ingress, without a key" 401 \
    "$(status_of /api/v1/orders/00000000-0000-0000-0000-000000000000)"
check "the Gateway delivery list through the ingress" 200 "$(status_of '/api/v1/operator/deliveries?limit=1')"

if ((failures > 0)); then
    fail "$failures check(s) failed."
fi
printf 'Verified: the mesh lets through only what it allows.\n'
