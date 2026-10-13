#!/usr/bin/env bash

# Installs, or removes, the observability stack of the local Kubernetes
# environment: Prometheus with the alert rules, Alertmanager, the OpenTelemetry
# Collector, Jaeger, and Grafana. Installing also turns tracing on in the Core and
# the Gateway.
#
# The configuration is the one in observability/, loaded into ConfigMaps, so the
# Compose profile and the cluster share it.
#
# Usage:
#   scripts/k8s/observability.sh            install (or update)
#   HUB_GRAFANA=false scripts/k8s/observability.sh   without Grafana
#   scripts/k8s/observability.sh remove     remove the stack and turn tracing off

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly NAMESPACE=observability
readonly CONFIG_DIR="$ROOT_DIR/observability"
readonly WITH_GRAFANA="${HUB_GRAFANA:-true}"

require_command kubectl
require_command helm

# A ConfigMap from files, created or updated in place.
load_configmap() {
    local name=$1
    shift
    kube -n "$NAMESPACE" create configmap "$name" "$@" --dry-run=client -o yaml | kube apply -f - >/dev/null
}

install_stack() {
    kube create namespace "$NAMESPACE" --dry-run=client -o yaml | kube apply -f - >/dev/null

    load_configmap prometheus-config \
        --from-file=prometheus.yml="$DEPLOY_DIR/observability/prometheus.yml" \
        --from-file=alerts.yml="$CONFIG_DIR/prometheus/alerts.yml"
    load_configmap alertmanager-config --from-file=alertmanager.yml="$CONFIG_DIR/alertmanager/alertmanager.yml"
    load_configmap otel-collector-config --from-file=config.yaml="$CONFIG_DIR/otel-collector/config.yaml"
    kube apply -f "$DEPLOY_DIR/observability/stack.yaml" >/dev/null

    if [[ "$WITH_GRAFANA" == "true" ]]; then
        load_configmap grafana-datasources --from-file="$CONFIG_DIR/grafana/provisioning/datasources/prometheus.yml"
        load_configmap grafana-dashboard-provider --from-file="$CONFIG_DIR/grafana/provisioning/dashboards/dashboards.yml"
        load_configmap grafana-dashboards --from-file="$CONFIG_DIR/grafana/dashboards/operations-overview.json"
        kube apply -f "$DEPLOY_DIR/observability/grafana.yaml" >/dev/null
    fi

    # Prometheus does not reload a changed ConfigMap by itself.
    kube -n "$NAMESPACE" rollout restart deployment/prometheus deployment/alertmanager deployment/otel-collector >/dev/null

    local deployment
    for deployment in prometheus alertmanager jaeger otel-collector; do
        wait_for_rollout "$NAMESPACE" "$deployment" 180s >/dev/null
    done
    if [[ "$WITH_GRAFANA" == "true" ]]; then
        wait_for_rollout "$NAMESPACE" grafana 180s >/dev/null
    fi

    # Turn tracing on in the applications (they restart with the new settings).
    install_chart
}

remove_stack() {
    kube delete namespace "$NAMESPACE" --ignore-not-found --wait >/dev/null
    kube -n "$APP_NAMESPACE" delete role prometheus-discovery rolebinding prometheus-discovery --ignore-not-found >/dev/null
    install_chart
}

case "${1:-install}" in
install)
    install_stack
    cat <<'TEXT'
The observability stack is running. To open it from this machine:

  export KUBECONFIG="$HOME/.kube/hub-local.yaml"
  kubectl -n observability port-forward svc/prometheus   9090:9090   # alerts and targets
  kubectl -n observability port-forward svc/alertmanager 9093:9093
  kubectl -n observability port-forward svc/jaeger       16686:16686 # traces
  kubectl -n observability port-forward svc/grafana      3000:3000
TEXT
    ;;
remove) remove_stack ;;
*) fail "Unknown command: $1 (use install or remove)." ;;
esac
