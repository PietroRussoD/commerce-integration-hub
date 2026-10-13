#!/usr/bin/env bash

# Deletes the local Kubernetes environment, with everything in it.
#
# Usage: scripts/k8s/down.sh

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_command kind

if ! cluster_exists; then
    printf 'Cluster %s does not exist.\n' "$CLUSTER_NAME"
    exit 0
fi

# Only a cluster that this environment's kubeconfig points at is deleted.
assert_local_cluster
kind_with_kubeconfig delete cluster
printf 'Cluster %s deleted. The kubeconfig %s is left in place.\n' "$CLUSTER_NAME" "$HUB_KUBECONFIG"
