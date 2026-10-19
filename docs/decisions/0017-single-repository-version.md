# ADR 0017: Version Deployable Modules With One Repository Version

- Status: Accepted
- Date: 2026-09-05

## Context

The repository contains three deployable modules and one development tool.
The deployable modules declare a version in their manifests:
`services/integration-core/pom.xml`,
`services/connector-gateway/package.json`, and
`apps/operator-console/package.json`.

Releases are already produced repository-wide. One annotated `vX.Y.Z` tag
identifies the release, and the release workflow promotes every published image
to that same tag, whether or not the corresponding module changed. Nothing in
the build, the runtime, or the container images reads the manifest versions, so
they carry no operational effect and no check detected when they disagreed.

They did disagree. The Integration Core stayed at `0.4.0` and the Connector
Gateway at `0.6.0` while the repository released `v0.7.0`, because the version
bump was a habit applied to one manifest rather than a documented, enforced
step. A reader opening `pom.xml` saw a version four releases behind the tag.

## Decision

Every deployable module carries the same version as the repository release it
belongs to:
`X.Y.Z-SNAPSHOT` while the milestone is in development, `X.Y.Z` on the commit
that is tagged.

`scripts/check-module-versions.sh` verifies that the deployable module
manifests and Helm chart agree. The provider simulator is a development tool,
not a deployable module, and its package version is outside this policy. CI runs
the check on every push and pull request, and the release workflow runs it with
the tag name so that a tag whose manifests do not match it cannot promote
images. The steps that apply the versions are documented in the
[release process](../releases/README.md).

A deployable module version therefore states which repository release the
module belongs to, and nothing more. It is not a claim that the module changed.

## Alternatives

- **Independent per-module semantic versions:** rejected because nothing
  consumes these modules as a dependency. They are deployed together from one
  Compose file and are never resolved from a registry by version, so
  independent numbering would add release tooling and a compatibility matrix
  without answering a question anyone asks.
- **Remove the version from the manifests entirely,** using a Maven `revision`
  property and a fixed `0.0.0` for the private packages: rejected because the
  literal version communicates more to a reader inspecting the repository than
  an unresolved property, and the automated check removes the drift that
  motivated the alternative.
- **Leave the manifests unmanaged:** rejected because it is what produced the
  drift. Versions that nothing verifies and nothing reads decay silently.

## Consequences

A deployable module advances to a new version even when the release did not
change it. Every release must bump three application manifests and both chart
version fields, and the check fails the build when they disagree. Publishing
any module to a registry as an independently consumable artifact would require
revisiting this decision, since consumers would then need a version that tracks
the module rather than the repository.
