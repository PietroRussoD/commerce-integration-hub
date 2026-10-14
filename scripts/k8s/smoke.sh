#!/usr/bin/env bash

# Sends one signed MARKETPLACE_A webhook through the Gateway and waits until the
# order is READY in the Integration Core: Gateway ledger, delivery to the Core,
# outbox, Kafka, consumer, and back. Run scripts/k8s/provision-source.sh first.
#
# With the mesh installed (scripts/k8s/mesh.sh), every request goes through the
# ingress, as a provider's or an operator's would.
#
# Usage: scripts/k8s/smoke.sh

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly GATEWAY_LOCAL_PORT="${SMOKE_GATEWAY_PORT:-18081}"
readonly CORE_LOCAL_PORT="${SMOKE_CORE_PORT:-18080}"
readonly WAIT_SECONDS="${SMOKE_WAIT_SECONDS:-60}"

require_command curl
require_command python3

trap stop_port_forwards EXIT

forward() {
    start_port_forward "$1" "svc/$2" "$3:$4"
}

wait_for_port() {
    local attempt
    for ((attempt = 1; attempt <= 30; attempt += 1)); do
        if curl --silent --output /dev/null "http://127.0.0.1:$1/"; then
            return 0
        fi
        sleep 1
    done
    fail "Port $1 did not open."
}

source_key_exists || fail "No source credential: run scripts/k8s/provision-source.sh first."

if mesh_installed; then
    printf 'Using the ingress.\n'
    forward hub-ingress hub-ingress-istio "$GATEWAY_LOCAL_PORT" 80
    gateway_url="http://127.0.0.1:$GATEWAY_LOCAL_PORT"
    core_url="$gateway_url"
    wait_for_port "$GATEWAY_LOCAL_PORT"
else
    forward "$APP_NAMESPACE" connector-gateway "$GATEWAY_LOCAL_PORT" 8081
    forward "$APP_NAMESPACE" integration-core "$CORE_LOCAL_PORT" 8080
    gateway_url="http://127.0.0.1:$GATEWAY_LOCAL_PORT"
    core_url="http://127.0.0.1:$CORE_LOCAL_PORT"
    wait_for_port "$GATEWAY_LOCAL_PORT"
    wait_for_port "$CORE_LOCAL_PORT"
fi

timestamp="$(date +%s)"
body="$(printf '{"eventId":"evt-smoke-%s","eventType":"order.created","order":{"orderNumber":"SMOKE-%s","currency":"EUR","totalCents":3998,"lines":[{"lineNumber":"1","productCode":"SKU-BOOK-1","quantity":2,"unitPriceCents":1999}]}}' \
    "$timestamp" "$timestamp")"
webhook_secret="$(kube -n "$APP_NAMESPACE" get secret hub-synthetic -o 'jsonpath={.data.webhookSecretBase64}' | base64 -d)"
key_id="$(kube -n "$APP_NAMESPACE" get secret hub-synthetic -o 'jsonpath={.data.webhookKeyId}' | base64 -d)"
# The signature is HMAC-SHA-256 over "<timestamp>.<body>", keyed with the decoded secret.
signature="$(python3 -c '
import base64, hashlib, hmac, sys
secret, timestamp, body = sys.argv[1:4]
print(hmac.new(base64.b64decode(secret), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest())
' "$webhook_secret" "$timestamp" "$body")"

response="$(curl --silent --show-error --write-out '\n%{http_code}' \
    --request POST "$gateway_url/providers/marketplace-a/v1/order-webhooks" \
    --header 'content-type: application/json' \
    --header "x-webhook-key-id: $key_id" \
    --header "x-webhook-timestamp: $timestamp" \
    --header "x-webhook-signature: v1=$signature" \
    --data "$body")"
[[ "${response##*$'\n'}" == "202" ]] || fail "The Gateway did not accept the webhook: $response"
delivery_id="$(printf '%s' "${response%$'\n'*}" | python3 -c 'import json, sys; print(json.load(sys.stdin)["deliveryId"])')"
printf 'Webhook accepted by the Gateway (delivery %s).\n' "$delivery_id"

json_field() {
    python3 -c 'import json, sys; print(json.load(sys.stdin).get(sys.argv[1]) or "")' "$1"
}

order_id=""
for ((second = 0; second < WAIT_SECONDS; second += 1)); do
    delivery="$(curl --silent "$gateway_url/api/v1/operator/deliveries/$delivery_id")"
    status="$(printf '%s' "$delivery" | json_field status)"
    if [[ "$status" == "DELIVERED" ]]; then
        order_id="$(printf '%s' "$delivery" | json_field lastCoreOrderId)"
        break
    fi
    sleep 1
done
[[ -n "$order_id" ]] || fail "The delivery did not reach DELIVERED within $WAIT_SECONDS seconds (last status: ${status:-unknown})."
printf 'Delivered to the Core as order %s.\n' "$order_id"

api_key="$(kube -n "$APP_NAMESPACE" get secret gateway-source-key -o 'jsonpath={.data.apiKey}' | base64 -d)"
for ((second = 0; second < WAIT_SECONDS; second += 1)); do
    order_status="$(curl --silent --header "X-Source-API-Key: $api_key" \
        "$core_url/api/v1/orders/$order_id" | json_field status)"
    if [[ "$order_status" == "READY" ]]; then
        printf 'Verified: order %s is READY.\n' "$order_id"
        exit 0
    fi
    sleep 1
done
fail "Order $order_id did not become READY within $WAIT_SECONDS seconds (last status: ${order_status:-unknown})."
