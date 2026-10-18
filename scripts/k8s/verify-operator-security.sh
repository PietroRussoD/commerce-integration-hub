#!/usr/bin/env bash

# Exercises the protected Helm profile through real HTTP, then restores the
# original local demo release. Requires up.sh and provision-source.sh first.
# Only public discovery/JWKS data is deployed; signing keys stay in host memory.
set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_command pnpm
require_command kubectl
require_command helm
assert_local_cluster

cd "$ROOT_DIR/services/connector-gateway"
exec pnpm exec tsx scripts/verify-operator-security.ts
