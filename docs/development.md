# Development and Verification

Run each command block from the repository root unless a different working
directory is stated. To run the application first, use the [local demo](local-demo.md).

## Prerequisites

- JDK 25 and Docker with the Compose plugin for the Core and integration tests;
- Node.js 24 or newer, below 27, and pnpm 11.23.0 for the TypeScript modules;
- Helm for chart validation.

The Maven Wrapper is committed; a separate Maven installation is unnecessary.

## Module checks

### Integration Core

```bash
cd services/integration-core
./mvnw verify
```

### Operator console

```bash
cd apps/operator-console
pnpm install --frozen-lockfile
pnpm check:api
pnpm check
pnpm test:e2e:install
pnpm test:e2e
```

### Connector Gateway

```bash
cd services/connector-gateway
pnpm install --frozen-lockfile
pnpm check
pnpm test:integration
```

### Provider simulator

```bash
cd tools/provider-simulator
pnpm install --frozen-lockfile
pnpm check
```

The Playwright browser suite runs locally against an automatically started Vite
server with deterministic API fixtures; it is not currently a GitHub Actions
gate.

## Security verification

CI scans the complete Git history with Gitleaks before running the build. The
repository configuration permits only a documented RFC 4231 test vector. Run
the same redacted check locally from the repository root:

```bash
docker run --rm \
  -v "$PWD:/repo" \
  ghcr.io/gitleaks/gitleaks:v8.30.1 git \
  --config /repo/.gitleaks.toml \
  --redact=100 \
  --no-banner \
  /repo
```

The published Integration Core and Connector Gateway images are scanned with
Trivy every Monday (`latest`) and on demand. A manual run can scan both images
at a selected release tag or one selected image by immutable `sha256` digest.
Each report artifact records the resolved digest, `linux/amd64` platform, scan
time, Trivy version, vulnerability database metadata and policy, and is retained
for 90 days. The full JSON report is uploaded before HIGH/CRITICAL findings fail
the job, so a failed scan remains reviewable. Scanner or image-resolution
failures also fail the job and are recorded as errors; they are not clean scans.

Run a release-tag scan with GitHub CLI after the workflow change is available on
the default branch:

```bash
gh workflow run security.yml -f image=all -f release_tag=v1.4.1
```

To repeat a scan from an exact digest, select one image and provide the digest
shown in a prior report:

```bash
gh workflow run security.yml \
  -f image=integration-core \
  -f image_digest=sha256:<64-lowercase-hex-digits>
```

The manual workflow accepts only the two published image names, SemVer release
tags, and SHA-256 digests. It scans `linux/amd64` consistently. The local
Integration Core command and release-image rules are documented in its
[container section](../services/integration-core/README.md#container-image).
Dependabot checks Maven dependencies, GitHub Actions, the service Dockerfile,
and Docker Compose images weekly. Minor and patch updates are grouped, while
major updates remain isolated for manual review. Java runtime major updates are
ignored so that LTS migrations remain coordinated across compilation, CI, and
the container image. Updates are never merged automatically.

## Deployment checks

From the repository root:

```bash
./scripts/check-module-versions.sh
helm lint deploy/charts/commerce-integration-hub
docker run --rm --entrypoint promtool -v "$PWD/observability/prometheus:/rules:ro" \
  prom/prometheus:v3.15.0 test rules /rules/alerts.test.yml
```

The [local Kubernetes guide](../deploy/README.md) describes the cluster and
failure checks, which require a running local cluster. Its
[protected operator acceptance check](../deploy/README.md#verify-the-protected-profile-locally)
verifies real HTTP authorization and replay against that environment and
restores its demo profile afterward. It is separate from the module checks.
The [release process](releases/README.md) records the complete release workflow.
