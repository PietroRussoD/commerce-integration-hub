#!/usr/bin/env bash

# Verifies that the Hub loses and duplicates nothing when something fails in the
# middle of the flow.
#
# A sender pod inside the cluster posts signed MARKETPLACE_A webhooks to the
# Gateway Service, retrying a failed request with the same bytes, as a provider
# would. While it sends, the chosen failure happens:
#
#   pods             one Core pod and one Gateway pod are killed without a grace period
#   core-primary     the primary of the Core's PostgreSQL cluster is killed (failover)
#   gateway-primary  the primary of the Gateway's PostgreSQL cluster is killed (failover)
#   core-slow        every call to the Core takes 3 s longer (needs the mesh)
#   core-errors      every call to the Core fails with 503 for 20 s (needs the mesh)
#   gateway-lease    the Core is slow and a Gateway pod is killed with deliveries in
#                    flight: its leases must expire and be recovered (needs the mesh)
#   core-db-blackhole  all traffic to the Core's PostgreSQL primary is dropped for 40 s,
#                    without closing a connection, as a lost node does (needs tc on the nodes)
#   broker           the Redpanda broker pod is killed
#   node             a worker node stops for a minute (the one with the Core's primary)
#   none             nothing fails (a check of the script itself)
#
# The script then waits for every delivery and order to settle and checks the
# two databases:
#
#   - one Gateway delivery per webhook, all DELIVERED;
#   - one Core order per webhook, all READY;
#   - each order RECEIVED, PROCESSING and READY exactly once;
#   - each order's OrderReceived and OrderReady events written and published once;
#   - each OrderReceived event recorded once by the order processor;
#   - no DELIVERED delivery whose order is missing from the Core.
#
# Run scripts/k8s/up.sh and scripts/k8s/provision-source.sh first.
#
# Usage: scripts/k8s/verify-failures.sh [pods|core-primary|gateway-primary|core-slow|
#                                         core-errors|gateway-lease|broker|node|none]
#   VERIFY_ORDERS=60          webhooks to send
#   VERIFY_WAIT_SECONDS=300   time allowed for everything to settle

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly SCENARIO="${1:-pods}"
readonly ORDERS="${VERIFY_ORDERS:-60}"
# The Gateway recovers an abandoned delivery lease after 60 s and the Core an
# abandoned outbox claim after 2 minutes, so settling can take a few minutes.
readonly WAIT_SECONDS="${VERIFY_WAIT_SECONDS:-300}"
readonly RUN_ID="$(date +%s)"
readonly SENDER="verify-sender-$RUN_ID"

require_command python3

case "$SCENARIO" in
pods | core-primary | gateway-primary | core-slow | core-errors | gateway-lease | core-db-blackhole | broker | node | none) ;;
*) fail "Unknown scenario: $SCENARIO (see the usage at the top of this script)." ;;
esac
case "$SCENARIO" in
core-slow | core-errors | gateway-lease)
    mesh_installed || fail "Scenario $SCENARIO injects the fault at the Core's waypoint: run scripts/k8s/mesh.sh first."
    ;;
esac

cleanup() {
    kube -n "$APP_NAMESPACE" delete pod "$SENDER" --ignore-not-found --wait=false >/dev/null 2>&1 || true
    kube -n "$APP_NAMESPACE" delete configmap "$SENDER" --ignore-not-found >/dev/null 2>&1 || true
}
trap cleanup EXIT

primary_pod() {
    kube -n "$DATA_NAMESPACE" get pod -l "cnpg.io/cluster=$1,cnpg.io/instanceRole=primary" -o name
}

# Runs one query on the primary of a database cluster and prints the bare result.
sql() {
    local cluster=$1 database=$2 query=$3
    kube -n "$DATA_NAMESPACE" exec "$(primary_pod "$cluster")" -c postgres -- \
        psql -U postgres -d "$database" -v ON_ERROR_STOP=1 -Atc "$query"
}

core_sql() { sql core integration_hub "$1"; }
gateway_sql() { sql gateway connector_gateway "$1"; }

ready_replicas() {
    kube -n "$APP_NAMESPACE" get deployment "$1" -o 'jsonpath={.status.readyReplicas}'
}

wait_for_replicas() {
    local deployment
    for deployment in integration-core connector-gateway; do
        wait_for_rollout "$APP_NAMESPACE" "$deployment" 300s >/dev/null
        [[ "$(ready_replicas "$deployment")" == "2" ]] || fail "$deployment does not have 2 ready replicas."
    done
}

start_sender() {
    kube -n "$APP_NAMESPACE" create configmap "$SENDER" --from-literal=sender.py="$(
        cat <<'PYTHON'
import base64, hashlib, hmac, json, os, sys, time, urllib.error, urllib.request

url = "http://connector-gateway:8081/providers/marketplace-a/v1/order-webhooks"
run_id, total = os.environ["RUN_ID"], int(os.environ["ORDERS"])
secret = base64.b64decode(os.environ["WEBHOOK_SECRET_BASE64"])
key_id = os.environ["WEBHOOK_KEY_ID"]
summary = {"sent": 0, "accepted": 0, "replays": 0, "retries": 0, "failed": 0}

def post(body):
    timestamp = str(int(time.time()))
    signature = hmac.new(secret, f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    request = urllib.request.Request(url, data=body, method="POST", headers={
        "content-type": "application/json",
        "x-webhook-key-id": key_id,
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": f"v1={signature}",
    })
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, response.headers.get("Idempotent-Replay") == "true"

for number in range(1, total + 1):
    body = json.dumps({
        "eventId": f"evt-verify-{run_id}-{number:03d}",
        "eventType": "order.created",
        "order": {
            "orderNumber": f"VERIFY-{run_id}-{number:03d}",
            "currency": "EUR",
            "totalCents": 3998,
            "lines": [{"lineNumber": "1", "productCode": "SKU-BOOK-1", "quantity": 2, "unitPriceCents": 1999}],
        },
    }, separators=(",", ":")).encode()
    summary["sent"] += 1
    # The same bytes are sent again after a failure, as a provider would, with a
    # growing pause, for up to three minutes: the Gateway recognises them.
    deadline, pause = time.monotonic() + 180, 1
    while True:
        try:
            status, replay = post(body)
            if status == 202:
                summary["accepted"] += 1
                summary["replays"] += replay
                break
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            pass
        if time.monotonic() >= deadline:
            summary["failed"] += 1
            break
        summary["retries"] += 1
        time.sleep(pause)
        pause = min(pause * 2, 10)
    time.sleep(0.15)

print("SUMMARY " + json.dumps(summary), flush=True)
PYTHON
    )" >/dev/null

    kube -n "$APP_NAMESPACE" apply -f - >/dev/null <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: $SENDER
  labels: { app.kubernetes.io/name: verify-sender }
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
    - name: sender
      image: python:3.14-alpine
      command: ["python", "-u", "/sender/sender.py"]
      env:
        - { name: RUN_ID, value: "$RUN_ID" }
        - { name: ORDERS, value: "$ORDERS" }
        - name: WEBHOOK_SECRET_BASE64
          valueFrom: { secretKeyRef: { name: hub-synthetic, key: webhookSecretBase64 } }
        - name: WEBHOOK_KEY_ID
          valueFrom: { secretKeyRef: { name: hub-synthetic, key: webhookKeyId } }
      resources: { limits: { memory: 64Mi } }
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: [ALL] }
      volumeMounts: [{ name: sender, mountPath: /sender }]
  volumes:
    - name: sender
      configMap: { name: $SENDER }
YAML
    kube -n "$APP_NAMESPACE" wait --for=condition=Ready "pod/$SENDER" --timeout=180s >/dev/null ||
        fail "The sender pod did not start."
}

# Injects a fault at the Core's waypoint, or takes it away again. A fault replaces
# the Core's VirtualService; the base file (no retries) restores it.
inject_core_fault() {
    kube apply -f "$DEPLOY_DIR/mesh/faults/$1.yaml" >/dev/null
    sleep 8
    printf '  fault injected at the Core waypoint: %s\n' "$1"
}

clear_core_fault() {
    kube apply -f "$DEPLOY_DIR/mesh/waypoint.yaml" >/dev/null
    printf '  fault removed\n'
}

# The names of the alerts active in Alertmanager, when the observability stack is
# installed; nothing otherwise.
active_alerts() {
    observability_installed || return 0
    start_port_forward observability svc/alertmanager 19094:9093
    local names="" attempt
    for ((attempt = 0; attempt < 10; attempt += 1)); do
        names="$(curl --silent "http://127.0.0.1:19094/api/v2/alerts" 2>/dev/null | python3 -c '
import json, sys
for alert in json.load(sys.stdin):
    if alert["status"]["state"] == "active":
        print(alert["labels"]["alertname"])' 2>/dev/null)" && break
        sleep 1
    done
    stop_port_forwards
    printf '%s' "$names"
}

# Waits for an alert to be active in Alertmanager. Skipped without the stack.
expect_alert() {
    local alert=$1 started=$SECONDS
    observability_installed || return 0
    while ((SECONDS - started < ${2:-150})); do
        if active_alerts | grep -qx "$alert"; then
            printf '  ok    %s reached Alertmanager after %d s\n' "$alert" "$((SECONDS - started))"
            return 0
        fi
        sleep 10
    done
    printf '  FAIL  %s did not reach Alertmanager\n' "$alert"
    failures=$((failures + 1))
}

# Drops every packet towards the Core's PostgreSQL primary for 40 s, then lets them
# through again. Unlike killing the pod, no connection is closed: the Core's
# threads wait on sockets that never answer, as they do when a node is lost.
blackhole_core_primary() {
    local primary ip node device
    primary="$(kube -n "$DATA_NAMESPACE" get cluster core -o 'jsonpath={.status.currentPrimary}')"
    ip="$(kube -n "$DATA_NAMESPACE" get pod "$primary" -o 'jsonpath={.status.podIP}')"
    node="$(kube -n "$DATA_NAMESPACE" get pod "$primary" -o 'jsonpath={.spec.nodeName}')"
    device="$(docker exec "$node" ip route get "$ip" | awk '{for (i = 1; i <= NF; i++) if ($i == "dev") print $(i + 1)}')"
    docker exec "$node" tc qdisc replace dev "$device" root netem loss 100%
    printf '  dropping all traffic to %s (%s) for 40 s\n' "$primary" "$ip"
    sleep 40
    docker exec "$node" tc qdisc del dev "$device" root
    printf '  traffic restored\n'
}

# Stops the worker node that hosts the primary of the Core's PostgreSQL cluster for
# a minute, then starts it again and waits for it to rejoin. Everything on it
# stops: the primary, possibly a Core and a Gateway replica, perhaps the broker.
stop_primary_node() {
    local primary node
    primary="$(kube -n "$DATA_NAMESPACE" get cluster core -o 'jsonpath={.status.currentPrimary}')"
    node="$(kube -n "$DATA_NAMESPACE" get pod "$primary" -o 'jsonpath={.spec.nodeName}')"
    printf '  stopping node %s, which hosts %s (the Core primary)\n' "$node" "$primary"
    docker stop "$node" >/dev/null
    sleep 60
    docker start "$node" >/dev/null
    printf '  node %s started again\n' "$node"
    local attempt
    for ((attempt = 0; attempt < 90; attempt += 1)); do
        kube get node "$node" -o 'jsonpath={.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q True && break
        sleep 2
    done
}

# Kills a pod of the deployment at once, as a crash would.
kill_one_pod() {
    local pod
    pod="$(kube -n "$APP_NAMESPACE" get pod -l "app.kubernetes.io/name=$1" \
        --field-selector=status.phase=Running -o 'jsonpath={.items[0].metadata.name}')"
    kube -n "$APP_NAMESPACE" delete pod "$pod" --grace-period=0 --force >/dev/null 2>&1
    printf '  killed %s\n' "$pod"
}

wait_for_sender() {
    local phase
    for ((second = 0; second < 600; second += 2)); do
        phase="$(kube -n "$APP_NAMESPACE" get pod "$SENDER" -o 'jsonpath={.status.phase}')"
        [[ "$phase" == "Succeeded" || "$phase" == "Failed" ]] && break
        sleep 2
    done
    kube -n "$APP_NAMESPACE" logs "$SENDER" | sed -n 's/^SUMMARY //p'
}

delivery_counts() {
    gateway_sql "select count(*), count(*) filter (where status = 'DELIVERED')
        from inbound_deliveries where external_event_id like 'evt-verify-$RUN_ID-%'"
}

# How many of the run's outbox events are published; the last OrderReady of an
# order is published after the order is READY, and after a backoff if the broker
# was away.
published_event_count() {
    core_sql "select count(*) from outbox_events where status = 'PUBLISHED'
        and aggregate_id in (select id from orders where external_order_id like 'VERIFY-$RUN_ID-%')"
}

order_counts() {
    core_sql "select count(*), count(*) filter (where status = 'READY')
        from orders where external_order_id like 'VERIFY-$RUN_ID-%'"
}

# Kills the primary of a PostgreSQL cluster and waits for another instance to be
# promoted, reporting how long that took.
kill_primary() {
    local cluster=$1 old new started
    old="$(kube -n "$DATA_NAMESPACE" get cluster "$cluster" -o 'jsonpath={.status.currentPrimary}')"
    started="$(date +%s)"
    kube -n "$DATA_NAMESPACE" delete pod "$old" --grace-period=0 --force >/dev/null 2>&1
    printf '  killed %s, the primary of %s\n' "$old" "$cluster"
    for ((second = 0; second < 180; second += 1)); do
        new="$(kube -n "$DATA_NAMESPACE" get cluster "$cluster" -o 'jsonpath={.status.currentPrimary}' 2>/dev/null || true)"
        if [[ -n "$new" && "$new" != "$old" ]] &&
            kube -n "$DATA_NAMESPACE" get pod "$new" -o 'jsonpath={.metadata.labels.cnpg\.io/instanceRole}' 2>/dev/null |
            grep -qx primary; then
            printf '  %s promoted after %d s\n' "$new" "$(($(date +%s) - started))"
            return 0
        fi
        sleep 1
    done
    printf '  no new primary for %s after 180 s\n' "$cluster"
}

wait_to_settle() {
    local deliveries orders events
    for ((second = 0; second < WAIT_SECONDS; second += 5)); do
        # A database can be unreachable for a moment during a failover.
        deliveries="$(delivery_counts 2>/dev/null || printf 'unavailable')"
        orders="$(order_counts 2>/dev/null || printf 'unavailable')"
        events="$(published_event_count 2>/dev/null || printf 'unavailable')"
        if [[ "$deliveries" == "$ORDERS|$ORDERS" && "$orders" == "$ORDERS|$ORDERS" && "$events" == "$((ORDERS * 2))" ]]; then
            printf '  settled after about %d s\n' "$second"
            return 0
        fi
        sleep 5
    done
    printf '  not settled after %d s: deliveries (total|delivered) %s, orders (total|ready) %s, events published %s\n' \
        "$WAIT_SECONDS" "$deliveries" "$orders" "$events"
}

failures=0
accepted=0

check() {
    local description=$1 expected=$2 actual=$3
    if [[ "$actual" == "$expected" ]]; then
        printf '  ok    %s: %s\n' "$description" "$actual"
    else
        printf '  FAIL  %s: expected %s, got %s\n' "$description" "$expected" "$actual"
        failures=$((failures + 1))
    fi
}

verify_databases() {
    local run_orders="select id from orders where external_order_id like 'VERIFY-$RUN_ID-%'"

    # The provider retries for three minutes; a webhook still refused after that
    # means the Gateway was unavailable for longer.
    check "webhooks accepted by the Gateway" "$ORDERS" "$accepted"

    check "Gateway deliveries, one per webhook" "$ORDERS" \
        "$(gateway_sql "select count(distinct external_event_id) from inbound_deliveries where external_event_id like 'evt-verify-$RUN_ID-%'")"
    check "Gateway deliveries DELIVERED" "$ORDERS" "$(delivery_counts | cut -d'|' -f2)"
    check "Core orders, one per webhook" "$ORDERS" \
        "$(core_sql "select count(distinct external_order_id) from orders where external_order_id like 'VERIFY-$RUN_ID-%'")"
    check "Core order rows (no duplicates)" "$ORDERS" "$(order_counts | cut -d'|' -f1)"
    check "Core orders READY" "$ORDERS" "$(order_counts | cut -d'|' -f2)"
    check "orders whose transitions are not exactly RECEIVED, PROCESSING, READY once each" "0" \
        "$(core_sql "select count(*) from ($run_orders) o where (
            select count(*) filter (where to_status = 'RECEIVED') || ',' ||
                   count(*) filter (where to_status = 'PROCESSING') || ',' ||
                   count(*) filter (where to_status = 'READY')
            from integration_events e where e.order_id = o.id) <> '1,1,1'")"
    check "outbox events per order and type above one" "0" \
        "$(core_sql "select count(*) from (select aggregate_id, event_type from outbox_events
            where aggregate_id in ($run_orders) group by 1, 2 having count(*) > 1) d")"
    check "OrderReceived and OrderReady events published" "$((ORDERS * 2))" \
        "$(core_sql "select count(*) from outbox_events where aggregate_id in ($run_orders)
            and event_type in ('OrderReceived', 'OrderReady') and status = 'PUBLISHED'")"
    check "OrderReceived events recorded by the order processor" "$ORDERS" \
        "$(core_sql "select count(*) from processed_messages p join outbox_events o on o.id = p.event_id
            where p.consumer_name = 'order-processor' and o.event_type = 'OrderReceived'
            and o.aggregate_id in ($run_orders)")"

    # An order the Gateway saw created and the Core no longer has was lost, for
    # example by a failover to a replica that had not received it yet.
    local delivered_order_ids
    delivered_order_ids="$(gateway_sql "select coalesce(string_agg(quote_literal(last_core_order_id::text), ','), '')
        from inbound_deliveries where external_event_id like 'evt-verify-$RUN_ID-%' and status = 'DELIVERED'")"
    if [[ -n "$delivered_order_ids" ]]; then
        check "DELIVERED deliveries whose order is missing from the Core" "0" \
            "$(core_sql "select count(*) from unnest(array[$delivered_order_ids]::uuid[]) as delivered(id)
                where not exists (select 1 from orders o where o.id = delivered.id)")"
    fi

    printf '  info  Gateway deliveries with more than one attempt: %s\n' \
        "$(gateway_sql "select count(*) from inbound_deliveries where external_event_id like 'evt-verify-$RUN_ID-%' and attempt_count > 1")"
    printf '  info  outbox events published after a retry: %s\n' \
        "$(core_sql "select count(*) from outbox_events where aggregate_id in ($run_orders) and publish_attempts > 1")"
}

main() {
    source_key_exists || fail "No source credential: run scripts/k8s/provision-source.sh first."
    printf 'Run %s: %s webhooks, failure: %s.\n' "$RUN_ID" "$ORDERS" "$SCENARIO"
    wait_for_replicas

    # Each Core replica consumes some of the topic's partitions.
    printf 'Order processor partitions by Core replica:\n'
    local pods
    pods="$(kube -n "$APP_NAMESPACE" get pod -l app.kubernetes.io/name=integration-core \
        -o 'jsonpath={range .items[*]}{.status.podIP}={.metadata.name};{end}')"
    kube -n "$DATA_NAMESPACE" exec redpanda-0 -c redpanda -- \
        rpk group describe integration-core-order-processor 2>/dev/null |
        awk -v pods="$pods" '
            BEGIN { n = split(pods, pairs, ";"); for (i = 1; i <= n; i++) { split(pairs[i], f, "="); name[f[1]] = f[2] } }
            $1 == "integration.order.received.v1" { print "  partition " $2 " -> " ($NF in name ? name[$NF] : $NF) }' || true

    # A slow Core must be slow before the first webhook arrives, or the deliveries
    # are forwarded, quickly, before it is.
    case "$SCENARIO" in
    core-slow | gateway-lease) inject_core_fault core-slow ;;
    esac

    printf 'Sending.\n'
    start_sender
    sleep 3
    case "$SCENARIO" in
    pods)
        kill_one_pod integration-core
        sleep 2
        kill_one_pod connector-gateway
        ;;
    core-primary) kill_primary core ;;
    gateway-primary) kill_primary gateway ;;
    core-slow) ;;
    core-db-blackhole) blackhole_core_primary ;;
    core-errors)
        inject_core_fault core-errors
        sleep 20
        clear_core_fault
        ;;
    gateway-lease)
        # Three seconds in, the Gateway replicas hold leases on deliveries that
        # are waiting for the slow Core.
        kill_one_pod connector-gateway
        ;;
    broker)
        kube -n "$DATA_NAMESPACE" delete pod redpanda-0 --grace-period=0 --force >/dev/null 2>&1
        printf '  killed redpanda-0, the broker\n'
        ;;
    node) stop_primary_node ;;
    none) ;;
    esac
    local sender_summary
    sender_summary="$(wait_for_sender)"
    printf '  sender: %s\n' "$sender_summary"
    accepted="$(printf '%s' "$sender_summary" | python3 -c 'import json, sys; print(json.load(sys.stdin)["accepted"])' 2>/dev/null || printf '0')"

    # A slow Core stays slow while the deliveries are forwarded, then is released.
    case "$SCENARIO" in
    core-slow | gateway-lease)
        sleep 15
        clear_core_fault
        ;;
    esac

    printf 'Waiting for deliveries and orders to settle.\n'
    wait_to_settle
    wait_for_replicas
    kube -n "$DATA_NAMESPACE" wait --for=condition=Ready cluster/core cluster/gateway --timeout=300s >/dev/null ||
        fail "The PostgreSQL clusters did not become healthy again."

    printf 'Checking the databases.\n'
    verify_databases

    # A fault that changes nothing proves nothing: the attempts the Gateway recorded
    # show whether it took effect.
    case "$SCENARIO" in
    core-slow | gateway-lease)
        check "delivery attempts that took 3 s or more (the delay took effect)" "yes" \
            "$(gateway_sql "select case when count(*) > 0 then 'yes' else 'no' end from delivery_attempts a
                join inbound_deliveries d on d.id = a.delivery_id
                where d.external_event_id like 'evt-verify-$RUN_ID-%' and a.duration_ms >= 3000")"
        ;;
    core-errors)
        check "delivery attempts the Core refused with 503 (the outage took effect)" "yes" \
            "$(gateway_sql "select case when count(*) > 0 then 'yes' else 'no' end from delivery_attempts a
                join inbound_deliveries d on d.id = a.delivery_id
                where d.external_event_id like 'evt-verify-$RUN_ID-%' and a.http_status = 503")"
        ;;
    esac

    case "$SCENARIO" in
    gateway-lease)
        # The killed pod's deliveries were leased for 60 s; another replica recovers them.
        check "deliveries recovered after their lease expired" "yes" \
            "$(gateway_sql "select case when count(*) filter (where attempt_count > 1) > 0 then 'yes' else 'no' end
                from inbound_deliveries where external_event_id like 'evt-verify-$RUN_ID-%'")"
        expect_alert GatewayDeliveryClaimsRecovered 120
        ;;
    core-errors) printf '  info  alerts active at the end: %s\n' "$(active_alerts | tr '\n' ' ')" ;;
    esac

    if ((failures > 0)); then
        fail "$failures check(s) failed."
    fi
    printf 'Verified (%s): %s orders, none lost and none duplicated.\n' "$SCENARIO" "$ORDERS"
}

main "$@"
