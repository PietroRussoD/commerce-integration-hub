#!/usr/bin/env bash

# Creates the MARKETPLACE_A source credential in the Integration Core, stores its
# one-time API key in a Secret, and turns on the Gateway's delivery worker.
#
# The key is created by the Core's own administrative command, run inside a Core
# pod, which already has the database settings and the credential pepper. It is
# printed by that command once and kept only in the Secret `gateway-source-key`.
#
# Usage: scripts/k8s/provision-source.sh
# To create a new key, revoke the old one first (see the Core README) and delete
# the Secret: kubectl -n hub delete secret gateway-source-key

set -Eeuo pipefail

# shellcheck source=scripts/k8s/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly ADMIN_COMMAND_CLASS="dev.pietrorussod.integrationhub.infrastructure.provisioning.SourceCredentialAdminCommand"
readonly SOURCE_SYSTEM="MARKETPLACE_A"
readonly PEPPER_VERSION=1

require_command kubectl
require_command helm
require_command python3

if source_key_exists; then
    printf 'The Secret gateway-source-key already exists: nothing to do.\n'
    exit 0
fi

printf 'Provisioning a %s source credential in the Core.\n' "$SOURCE_SYSTEM"
output="$(kube -n "$APP_NAMESPACE" exec deploy/integration-core -c integration-core -- \
    java -Xmx96m -cp '/work/app/*:/work/lib/main/*' "$ADMIN_COMMAND_CLASS" \
    provision "$SOURCE_SYSTEM" "$PEPPER_VERSION")"

key_id="$(printf '%s\n' "$output" | sed -n 's/^keyId=//p')"
api_key="$(printf '%s\n' "$output" | sed -n 's/^apiKey=//p')"
[[ -n "$key_id" && -n "$api_key" ]] || fail "The Core did not return a credential."

# The key goes to the Secret through standard input, never through arguments.
printf '%s' "$api_key" | kube -n "$APP_NAMESPACE" create secret generic gateway-source-key \
    --from-file=apiKey=/dev/stdin >/dev/null
kube -n "$APP_NAMESPACE" label secret gateway-source-key \
    "app.kubernetes.io/part-of=commerce-integration-hub" "hub.local/source-key-id=$key_id" >/dev/null

printf 'Credential %s stored. Turning on the Gateway delivery worker.\n' "$key_id"
install_chart
printf 'Done.\n'
