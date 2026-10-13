#!/usr/bin/env bash

# Creates (or updates) the local Kubernetes environment: a kind cluster, the
# PostgreSQL and Redpanda operators, the data services, and the Hub chart.
#
# Safe to run again: every step checks what already exists.
#
# Usage:
#   scripts/k8s/up.sh
#   HUB_SKIP_BUILD=true scripts/k8s/up.sh   # reuse the images already built

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly IMAGE_REPOSITORY_PREFIX="hub-local"
readonly IMAGE_TAG="dev"
readonly IMAGES=(integration-core connector-gateway provider-simulator)

check_requirements() {
    local tool
    for tool in docker kind kubectl helm java; do
        require_command "$tool"
    done
    docker info >/dev/null 2>&1 || fail "Docker is not running."
    local memory_bytes
    memory_bytes="$(docker info --format '{{.MemTotal}}')"
    if ((memory_bytes < 7500000000)); then
        printf 'Warning: Docker has less than 8 GB of memory; the stack may not fit.\n' >&2
    fi
}

create_cluster() {
    if cluster_exists; then
        printf 'Cluster %s already exists.\n' "$CLUSTER_NAME"
    else
        printf 'Creating cluster %s.\n' "$CLUSTER_NAME"
        kind_with_kubeconfig create cluster --config "$DEPLOY_DIR/kind/cluster.yaml" --image "$KIND_NODE_IMAGE" --wait 5m
    fi
    kube get nodes >/dev/null
}

build_images() {
    if [[ "${HUB_SKIP_BUILD:-false}" == "true" ]]; then
        printf 'Skipping the image build.\n'
        return
    fi
    printf 'Building the images for this machine.\n'
    (cd "$ROOT_DIR/services/integration-core" && ./mvnw -q package -DskipTests)
    docker build -q -t "$IMAGE_REPOSITORY_PREFIX/integration-core:$IMAGE_TAG" \
        -f "$ROOT_DIR/services/integration-core/src/main/docker/Dockerfile.jvm" \
        "$ROOT_DIR/services/integration-core" >/dev/null
    docker build -q -t "$IMAGE_REPOSITORY_PREFIX/connector-gateway:$IMAGE_TAG" \
        "$ROOT_DIR/services/connector-gateway" >/dev/null
    docker build -q -t "$IMAGE_REPOSITORY_PREFIX/provider-simulator:$IMAGE_TAG" \
        "$ROOT_DIR/tools/provider-simulator" >/dev/null
}

load_images() {
    local image
    for image in "${IMAGES[@]}"; do
        kind_load_image "$IMAGE_REPOSITORY_PREFIX/$image:$IMAGE_TAG" >/dev/null
    done
}

add_helm_repositories() {
    helm_cmd repo add cnpg https://cloudnative-pg.github.io/charts --force-update >/dev/null
    helm_cmd repo add redpanda https://charts.redpanda.com --force-update >/dev/null
    helm_cmd repo update >/dev/null
}

install_operators() {
    add_helm_repositories
    helm_cmd upgrade --install cnpg cnpg/cloudnative-pg \
        --namespace cnpg-system --create-namespace \
        --version "$CNPG_CHART_VERSION" --wait >/dev/null
    helm_cmd upgrade --install redpanda-operator redpanda/operator \
        --namespace redpanda-system --create-namespace \
        --version "$REDPANDA_OPERATOR_CHART_VERSION" \
        --set crds.enabled=true --wait >/dev/null
}

install_data_services() {
    kube create namespace "$DATA_NAMESPACE" --dry-run=client -o yaml | kube apply -f - >/dev/null
    kube apply -f "$DEPLOY_DIR/data/postgres.yaml" -f "$DEPLOY_DIR/data/redpanda.yaml" >/dev/null
    kube -n "$DATA_NAMESPACE" wait --for=condition=Ready cluster/core cluster/gateway --timeout=600s
    kube -n "$DATA_NAMESPACE" wait --for=condition=Ready redpanda/redpanda --timeout=900s
    kube apply -f "$DEPLOY_DIR/data/topics.yaml" >/dev/null
    kube -n "$DATA_NAMESPACE" wait --for=condition=Ready topic --all --timeout=180s
}

# The applications read the database credentials that the operator created in the
# data namespace, so they are copied into the application namespace.
copy_database_secrets() {
    kube create namespace "$APP_NAMESPACE" --dry-run=client -o yaml | kube apply -f - >/dev/null
    local database
    for database in core gateway; do
        kube -n "$DATA_NAMESPACE" get secret "$database-app" -o json |
            python3 -c '
import json, sys
source = json.load(sys.stdin)
name = sys.argv[1] + "-db"
keys = ("username", "password", "uri")
print(json.dumps({
    "apiVersion": "v1", "kind": "Secret",
    "metadata": {"name": name, "namespace": "hub"},
    "type": "Opaque",
    "data": {key: source["data"][key] for key in keys},
}))' "$database" | kube apply -f - >/dev/null
    done
}

# The images keep the tag `dev`, so a Deployment does not notice a new build by
# itself: after loading one, the application pods are restarted to run it.
restart_applications() {
    local deployment
    for deployment in integration-core connector-gateway provider-simulator; do
        kube -n "$APP_NAMESPACE" rollout restart "deployment/$deployment" >/dev/null
    done
    for deployment in integration-core connector-gateway provider-simulator; do
        wait_for_rollout "$APP_NAMESPACE" "$deployment" 300s >/dev/null
    done
}

main() {
    check_requirements
    create_cluster
    build_images
    load_images
    install_operators
    install_data_services
    copy_database_secrets
    install_chart
    if [[ "${HUB_SKIP_BUILD:-false}" != "true" ]]; then
        restart_applications
    fi
    printf '\nThe Hub is running in cluster %s (context %s, kubeconfig %s).\n' \
        "$CLUSTER_NAME" "$KUBE_CONTEXT" "$HUB_KUBECONFIG"
    printf 'Next: scripts/k8s/provision-source.sh, then scripts/k8s/smoke.sh.\n'
}

main "$@"
