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
Trivy every Monday and on demand instead of being rebuilt and scanned on every
push. The local Integration Core command and release-image rules are documented
in its [container section](../services/integration-core/README.md#container-image).
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
failure checks, which require a running local cluster. The
[release process](releases/README.md) records the complete release workflow.
