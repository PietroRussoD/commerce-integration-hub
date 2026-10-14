#!/usr/bin/env bash

# Verifies that every deployable module, and the Helm chart, declares the same
# version.
#
# The repository releases its modules together: one annotated tag promotes every
# published image, so a manifest that disagrees with its siblings misreports the
# release it belongs to. The release procedure is documented in
# docs/releases/README.md.
#
# Usage:
#   scripts/check-module-versions.sh          # manifests must agree with each other
#   scripts/check-module-versions.sh v0.8.0   # manifests must also equal the tag

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

core_pom="$repository_root/services/integration-core/pom.xml"
gateway_manifest="$repository_root/services/connector-gateway/package.json"
console_manifest="$repository_root/apps/operator-console/package.json"
chart_manifest="$repository_root/deploy/charts/commerce-integration-hub/Chart.yaml"

# The project version is the first <version> element, which precedes <properties>.
# Every later element belongs to a plugin or dependency and must not be read.
read_pom_version() {
  awk '
    /<properties>/ { exit }
    match($0, /<version>[^<]+<\/version>/) {
      print substr($0, RSTART + 9, RLENGTH - 19)
      exit
    }
  ' "$1"
}

read_manifest_version() {
  sed -n -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$1" | head -n 1
}

core_version="$(read_pom_version "$core_pom")"
gateway_version="$(read_manifest_version "$gateway_manifest")"
console_version="$(read_manifest_version "$console_manifest")"

# The chart declares its own version and the version of the application it
# installs; both must be the repository version.
read_chart_field() {
  sed -n -E "s/^$2:[[:space:]]*\"?([^\"[:space:]]+)\"?[[:space:]]*\$/\1/p" "$1" | head -n 1
}

chart_version="$(read_chart_field "$chart_manifest" version)"
chart_app_version="$(read_chart_field "$chart_manifest" appVersion)"

for module in "integration-core:$core_version" "connector-gateway:$gateway_version" "operator-console:$console_version" "chart-version:$chart_version" "chart-appVersion:$chart_app_version"; do
  if [ -z "${module#*:}" ]; then
    echo "Could not read the declared version of ${module%%:*}." >&2
    exit 1
  fi
done

report_versions() {
  printf '  %-18s %s\n' "integration-core" "$core_version" >&2
  printf '  %-18s %s\n' "connector-gateway" "$gateway_version" >&2
  printf '  %-18s %s\n' "operator-console" "$console_version" >&2
  printf '  %-18s %s\n' "chart version" "$chart_version" >&2
  printf '  %-18s %s\n' "chart appVersion" "$chart_app_version" >&2
}

if [ "$core_version" != "$gateway_version" ] || [ "$core_version" != "$console_version" ] ||
  [ "$core_version" != "$chart_version" ] || [ "$core_version" != "$chart_app_version" ]; then
  echo "Module versions disagree:" >&2
  report_versions
  echo >&2
  echo "Every module and the Helm chart move to the same version. See docs/releases/README.md." >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  expected_version="${1#v}"

  if [ "$core_version" != "$expected_version" ]; then
    echo "Modules declare $core_version but the release tag requires $expected_version." >&2
    report_versions
    echo >&2
    echo "Release the commit prepared by the release step. See docs/releases/README.md." >&2
    exit 1
  fi
fi

echo "Module versions are aligned at $core_version."
