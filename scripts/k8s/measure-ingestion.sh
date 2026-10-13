#!/usr/bin/env bash

# Measures how long the Integration Core takes to accept an order, and how far
# behind the primary its PostgreSQL replica is while it does.
#
# A pod inside the cluster posts orders one after another to the Core Service with
# the provisioned source API key and reports the latency percentiles. Meanwhile
# the replication lag of the `core` cluster is sampled every second from
# pg_stat_replication. Use it to compare replication settings.
#
# Run scripts/k8s/up.sh and scripts/k8s/provision-source.sh first.
#
# Usage: scripts/k8s/measure-ingestion.sh [orders]   (default 200)

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly ORDERS="${1:-200}"
readonly RUN_ID="$(date +%s)"
readonly CLIENT="measure-client-$RUN_ID"
readonly LAG_FILE="$(mktemp)"

require_command python3

cleanup() {
    [[ -n "${sampler_pid:-}" ]] && kill "$sampler_pid" 2>/dev/null || true
    rm -f "$LAG_FILE"
    kube -n "$APP_NAMESPACE" delete pod "$CLIENT" --ignore-not-found --wait=false >/dev/null 2>&1 || true
    kube -n "$APP_NAMESPACE" delete configmap "$CLIENT" --ignore-not-found >/dev/null 2>&1 || true
}
trap cleanup EXIT

source_key_exists || fail "No source credential: run scripts/k8s/provision-source.sh first."

primary_pod() {
    kube -n "$DATA_NAMESPACE" get pod -l "cnpg.io/cluster=core,cnpg.io/instanceRole=primary" -o name
}

# One line per second: the replica's write, flush and replay lag in milliseconds,
# or "none" when no replica is streaming.
sample_lag() {
    local primary
    while true; do
        primary="$(primary_pod 2>/dev/null || true)"
        if [[ -n "$primary" ]]; then
            kube -n "$DATA_NAMESPACE" exec "$primary" -c postgres -- psql -U postgres -Atc \
                "select coalesce(round(max(extract(epoch from write_lag) * 1000)::numeric, 2), -1) || ' ' ||
                        coalesce(round(max(extract(epoch from flush_lag) * 1000)::numeric, 2), -1) || ' ' ||
                        coalesce(round(max(extract(epoch from replay_lag) * 1000)::numeric, 2), -1) || ' ' ||
                        coalesce(string_agg(sync_state, ','), 'none')
                 from pg_stat_replication" 2>/dev/null >>"$LAG_FILE" || true
        fi
        sleep 1
    done
}

kube -n "$APP_NAMESPACE" create configmap "$CLIENT" --from-literal=client.py="$(
    cat <<'PYTHON'
import json, os, statistics, time, urllib.error, urllib.request

url = "http://integration-core:8080/api/v1/orders"
key, run_id, total = os.environ["SOURCE_API_KEY"], os.environ["RUN_ID"], int(os.environ["ORDERS"])
latencies, errors = [], 0
for number in range(1, total + 1):
    body = json.dumps({
        "externalId": f"MEASURE-{run_id}-{number:04d}",
        "currency": "EUR",
        "declaredTotalAmount": "39.98",
        "items": [{"externalLineId": "1", "sku": "SKU-BOOK-1", "description": "Architecture handbook",
                   "quantity": "2", "unitPrice": "19.99"}],
    }).encode()
    request = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "X-Source-API-Key": key})
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            ok = response.status in (200, 201)
    except (urllib.error.URLError, ConnectionError, TimeoutError):
        ok = False
    elapsed = (time.perf_counter() - started) * 1000
    if ok:
        latencies.append(elapsed)
    else:
        errors += 1

def percentile(values, share):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(share * len(ordered)))] if ordered else 0

print("RESULT " + json.dumps({
    "orders": total, "errors": errors,
    "p50_ms": round(percentile(latencies, 0.50), 1),
    "p95_ms": round(percentile(latencies, 0.95), 1),
    "p99_ms": round(percentile(latencies, 0.99), 1),
    "max_ms": round(max(latencies, default=0), 1),
    "mean_ms": round(statistics.fmean(latencies), 1) if latencies else 0,
}), flush=True)
PYTHON
)" >/dev/null

kube -n "$APP_NAMESPACE" apply -f - >/dev/null <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: $CLIENT
  labels: { app.kubernetes.io/name: measure-client }
spec:
  restartPolicy: Never
  # The identity the mesh lets reach the applications for tests (deploy/mesh).
  serviceAccountName: hub-test-client
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: client
      image: python:3.14-alpine
      command: ["python", "-u", "/client/client.py"]
      env:
        - { name: RUN_ID, value: "$RUN_ID" }
        - { name: ORDERS, value: "$ORDERS" }
        - name: SOURCE_API_KEY
          valueFrom: { secretKeyRef: { name: gateway-source-key, key: apiKey } }
      resources: { limits: { memory: 64Mi } }
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: [ALL] }
      volumeMounts: [{ name: client, mountPath: /client }]
  volumes:
    - name: client
      configMap: { name: $CLIENT }
YAML

sample_lag &
sampler_pid=$!

for ((second = 0; second < 900; second += 2)); do
    phase="$(kube -n "$APP_NAMESPACE" get pod "$CLIENT" -o 'jsonpath={.status.phase}')"
    [[ "$phase" == "Succeeded" || "$phase" == "Failed" ]] && break
    sleep 2
done
kill "$sampler_pid" 2>/dev/null || true
wait "$sampler_pid" 2>/dev/null || true
sampler_pid=""

printf 'Replication of core: %s\n' "$(
    kube -n "$DATA_NAMESPACE" get cluster core -o 'jsonpath={.spec.postgresql.synchronous}' | grep . || printf 'asynchronous'
)"
printf 'Ingestion: %s\n' "$(kube -n "$APP_NAMESPACE" logs "$CLIENT" | sed -n 's/^RESULT //p')"
python3 - "$LAG_FILE" <<'PYTHON'
import sys
rows = [line.split() for line in open(sys.argv[1]) if line.strip()]
states = sorted({row[3] for row in rows})
values = {name: [float(row[i]) for row in rows if float(row[i]) >= 0] for i, name in ((0, "write"), (1, "flush"), (2, "replay"))}
summary = ", ".join(
    f"{name} max {max(v):.2f} ms, mean {sum(v) / len(v):.2f} ms" if v else f"{name} n/a" for name, v in values.items())
print(f"Replica lag over {len(rows)} samples: {summary}; states: {', '.join(states)}")
PYTHON
