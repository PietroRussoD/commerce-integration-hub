# Releases

Each release note in this directory records one published milestone: what it
adds, how it was verified, and what it deliberately leaves out. This page
records how a release is produced.

## One version for the whole repository

The Integration Core, the Connector Gateway, the Operator Console, and the
Helm chart are versioned together. A single annotated `vX.Y.Z` tag identifies the release, and
`.github/workflows/release-image.yml` promotes every published image to that
same tag. A module therefore advances even when the release did not change it.

Independent per-module versions were considered and rejected. Nothing consumes
these modules as a dependency: they are deployed together from one `compose.yaml`
and are never resolved from a registry by version. Independent numbering would
add release tooling and a compatibility matrix without answering a question
anyone asks.

The consequence is that a module version carries no information on its own. It
states which repository release the module belongs to, nothing more. The
decision and its alternatives are recorded in
[ADR 0017](../decisions/0017-single-repository-version.md).

## Producing a release

1. **Open development.** Commit `🔖 Start vX.Y.Z development`, setting every
   module manifest to `X.Y.Z-SNAPSHOT`:
   - `services/integration-core/pom.xml`
   - `services/connector-gateway/package.json`
   - `apps/operator-console/package.json`
   - `deploy/charts/commerce-integration-hub/Chart.yaml` (`version` and
     `appVersion`)
2. **Build the milestone.** Implement one acceptance-tested increment at a time,
   keeping `main` buildable and accurately documented.
3. **Prepare the release.** Commit `🔖 Prepare vX.Y.Z release`, which drops the
   `-SNAPSHOT` suffix from all three manifests and the chart, adds `docs/releases/vX.Y.Z.md`,
   and updates the README and any documentation that claims new behavior.
4. **Verify.** Run the required checks in `AGENTS.md` and record the results,
   including the green GitHub Actions run, in the release note.
5. **Tag.** Create the annotated `vX.Y.Z` tag on the verified commit and push it.
   The release workflow verifies that the promoted image was built from an
   ancestor of the tagged commit before publishing it under the release tag.
6. **Publish.** Create the non-draft, non-prerelease GitHub Release.

## Enforcement

`scripts/check-module-versions.sh` fails when the three manifests and the Helm
chart disagree. CI
runs it on every push and pull request, and the release workflow runs it with the
tag name so that a tag whose manifests do not match it cannot promote images.

Run it locally at any time:

```bash
./scripts/check-module-versions.sh
```

## Published releases

- [v0.1.0](v0.1.0.md): reliable canonical order ingestion.
- [v0.2.0](v0.2.0.md): reliable Kafka outbox publication.
- [v0.3.0](v0.3.0.md): idempotent Kafka order processing.
- [v0.4.0](v0.4.0.md): operator console and controlled simulation.
- [v0.5.0](v0.5.0.md): durable provider gateway and forwarding.
- [v0.6.0](v0.6.0.md): ERP polling and local observability.
- [v0.7.0](v0.7.0.md): integration flow explorer.
- [v0.8.0](v0.8.0.md): rebuildable OpenSearch order projection and search.
- [v0.9.0](v0.9.0.md): durable search projection progress and observability.
- [v1.0.0](v1.0.0.md): governed operator workflows and versioned contracts.
- [v1.1.0](v1.1.0.md): distributed tracing across durable workflows.
