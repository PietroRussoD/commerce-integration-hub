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
#   - the waypoint in front of the Core does not retry a failed call, whereas
#     without the explicit no-retry policy it does;
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
    kube -n "$APP_NAMESPACE" delete deployment/retry-probe service/retry-probe virtualservice/retry-probe \
        authorizationpolicy/retry-probe --ignore-not-found >/dev/null 2>&1 || true
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

# "allowed" when the application answers, "refused" when the connection is cut
# before it does (a pod or workload policy, enforced by ztunnel) or the waypoint
# answers 403 (the policy on the waypoint).
reach() {
    local namespace=$1 pod=$2 url=$3 code
    code="$(kube -n "$namespace" exec "$pod" -- curl --silent --output /dev/null --max-time 5 \
        --write-out '%{http_code}' "$url" 2>/dev/null || true)"
    if [[ "$code" =~ ^[1-5][0-9][0-9]$ && "$code" != "403" ]]; then
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
    # A waypoint is a proxy of the mesh, not a workload that joins it.
    running="$(kube -n "$namespace" get pods --field-selector=status.phase=Running \
        -l '!gateway.networking.k8s.io/gateway-name' --no-headers 2>/dev/null | wc -l | tr -d ' ')"
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
expected_targets="$(kube -n "$APP_NAMESPACE" get pods -l 'app.kubernetes.io/name in (integration-core,connector-gateway)' \
    --field-selector=status.phase=Running --no-headers | wc -l | tr -d ' ')"
# Pods that have just restarted are scraped for the first time within a scrape
# interval, so wait for them rather than count too early.
targets=""
for ((attempt = 0; attempt < 12; attempt += 1)); do
    targets="$(curl --silent "http://127.0.0.1:$PROMETHEUS_PORT/api/v1/targets" | python3 -c '
import json, sys
targets = json.load(sys.stdin)["data"]["activeTargets"]
up = sum(target["health"] == "up" for target in targets)
print(f"{up}/{len(targets)}")')"
    [[ "$targets" == "$expected_targets/$expected_targets" ]] && break
    sleep 5
done
check "application replicas Prometheus scrapes successfully" "$expected_targets/$expected_targets" "$targets"

# A stand-in server behind the Core's waypoint that fails two ways, and counts
# the requests it receives: `/fail` answers 503, and `/close` closes the
# connection without answering. How many requests it sees says how many times
# the mesh tried.
deploy_retry_probe() {
    kube apply -f - >/dev/null <<YAML
apiVersion: apps/v1
kind: Deployment
metadata: { name: retry-probe, namespace: $APP_NAMESPACE }
spec:
  replicas: 1
  selector: { matchLabels: { app.kubernetes.io/name: retry-probe } }
  template:
    metadata: { labels: { app.kubernetes.io/name: retry-probe } }
    spec:
      serviceAccountName: hub-test-client
      automountServiceAccountToken: false
      securityContext: { runAsNonRoot: true, runAsUser: 65534, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: server
          image: python:3.14-alpine
          command: ["python", "-u", "-c"]
          args:
            - |
              import socket, threading
              server = socket.socket()
              server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
              server.bind(("", 8080)); server.listen(64)
              def handle(connection):
                  data = connection.recv(4096)
                  path = data.split(b" ")[1].decode() if b" " in data else "?"
                  print("request", path, flush=True)
                  if path != "/close":
                      connection.sendall(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                  connection.close()
              while True:
                  connection, _ = server.accept()
                  threading.Thread(target=handle, args=(connection,), daemon=True).start()
          resources: { limits: { memory: 64Mi } }
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: [ALL] } }
---
apiVersion: v1
kind: Service
metadata:
  name: retry-probe
  namespace: $APP_NAMESPACE
  labels: { istio.io/use-waypoint: core-waypoint }
spec:
  selector: { app.kubernetes.io/name: retry-probe }
  # The port is named http: the waypoint applies HTTP behaviour, retries included,
  # only to HTTP ports.
  ports: [{ name: http, port: 8080, targetPort: 8080 }]
---
# The stand-in only accepts the Core's waypoint, which admits the test identity.
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata: { name: retry-probe, namespace: $APP_NAMESPACE }
spec:
  selector: { matchLabels: { app.kubernetes.io/name: retry-probe } }
  action: ALLOW
  rules:
    - from: [{ source: { principals: ["cluster.local/ns/$APP_NAMESPACE/sa/core-waypoint"] } }]
YAML
    kube -n "$APP_NAMESPACE" rollout status deploy/retry-probe --timeout=180s >/dev/null
}

# Applies, or removes, the explicit no-retry policy for the stand-in: the same
# policy as the Core's, for its host.
set_retry_probe_policy() {
    kube -n "$APP_NAMESPACE" delete virtualservice retry-probe --ignore-not-found >/dev/null
    if [[ "$1" == "no-retries" ]]; then
        kube apply -f - >/dev/null <<YAML
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata: { name: retry-probe, namespace: $APP_NAMESPACE }
spec:
  hosts: [retry-probe.$APP_NAMESPACE.svc.cluster.local]
  http:
    - route:
        - destination: { host: retry-probe.$APP_NAMESPACE.svc.cluster.local, port: { number: 8080 } }
      retries: { attempts: 0 }
YAML
    fi
    sleep 8
}

# How many times the stand-in was asked for a path, after one request to it.
attempts_for() {
    local path=$1 before after
    before="$(kube -n "$APP_NAMESPACE" logs deploy/retry-probe -c server 2>/dev/null | grep -c "^request $path\$" || true)"
    kube -n "$APP_NAMESPACE" exec mesh-probe-test-client -- curl --silent --output /dev/null --max-time 15 \
        "http://retry-probe.$APP_NAMESPACE:8080$path" 2>/dev/null || true
    sleep 2
    after="$(kube -n "$APP_NAMESPACE" logs deploy/retry-probe -c server 2>/dev/null | grep -c "^request $path\$" || true)"
    printf '%d' "$((after - before))"
}

printf 'Retries in the mesh.\n'
deploy_retry_probe
set_retry_probe_policy default
printf '  info  with no explicit policy, one failing call reached the server %s time(s) for a 503 and %s time(s) for a dropped connection\n' \
    "$(attempts_for /fail)" "$(attempts_for /close)"
set_retry_probe_policy no-retries
check "attempts the server sees for one call answered 503, with the no-retry policy" 1 "$(attempts_for /fail)"
check "attempts the server sees for one call that drops, with the no-retry policy" 1 "$(attempts_for /close)"
check "the Core's own policy sets no retries" 0 \
    "$(kube -n "$APP_NAMESPACE" get virtualservice integration-core -o 'jsonpath={.spec.http[0].retries.attempts}')"

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
