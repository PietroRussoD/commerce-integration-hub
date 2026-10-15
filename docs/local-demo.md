# Local Demo

Use a JDK 25, Docker with the Compose plugin, Node.js 24 or newer (below 27),
and pnpm 11.23.0. Run commands from the repository root unless stated otherwise.
The setup uses synthetic providers and development credentials; keep it on a
trusted development machine. See [current limitations](limitations.md).

## Integration Core

Build the service and start it with PostgreSQL and Redpanda:

```bash
cd services/integration-core
./mvnw package -DskipTests
cd ../..
docker compose up --build --wait
```

Redpanda Console is available at
[http://localhost:8082](http://localhost:8082) for inspecting topics, records,
consumer groups, and lag. Set `REDPANDA_CONSOLE_PORT` to expose it on a
different local port.

Then follow the [local demo](../services/integration-core/README.md#local-demo) to
provision a source credential and exercise reliable order ingestion. The
credentials in `compose.yaml` are deliberately restricted to local development.

## Optional order search

Start the optional OpenSearch projection and its bounded reconciliation job
with:

```bash
ORDER_SEARCH_PROJECTION_ENABLED=true ORDER_SEARCH_RECONCILIATION_ENABLED=true docker compose --profile search up --build --wait
```

The Integration Core image is intentionally runtime-only. After changing Core
source code or resources, run `./mvnw package -DskipTests` from
`services/integration-core` before rebuilding Compose; otherwise Docker copies
the previously packaged `target/quarkus-app` artifact.

The base Compose stack does not start OpenSearch, and both runtime paths remain
disabled by default. The profile creates `orders-read` on the first projected
order; reconciliation then pages through authoritative READY orders every 30
seconds. Inspect its live availability and latest completed checkpoint at
`GET /api/v1/operator/orders/search/status`. The same endpoint exposes the
read-only progress of an active full reindex; starting that administrative
operation is intentionally outside the local demo contract.

## Connector Gateway and synthetic providers

Run the containerized Connector Gateway, its dedicated PostgreSQL database,
and its one-shot migration job with:

```bash
docker compose --profile gateway up --build --wait connector-gateway
```

The Gateway accepts signed local `MARKETPLACE_A` webhooks on port `8081`. Its
forwarding worker remains disabled in the committed Compose configuration until
an Integration Core source credential is provided. The same profile starts the
provider simulator on port `8083`; ERP_B polling remains disabled unless
`CONNECTOR_GATEWAY_ERP_B_POLLING_ENABLED=true` is supplied. See the
[Gateway runbook](../services/connector-gateway/README.md#run) for the topology,
health endpoints, and source-development workflow.

## Operator console

Run the operator console in a second terminal, starting from the repository root:

```bash
cd apps/operator-console
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The simulator accepts the
source API key created by the local demo and keeps it only in page memory.
When the optional `search` Compose profile is running and the projection is
available, the Orders page also searches projected orders by item description,
external order ID, or SKU.

## Metrics and tracing

Start the optional version-controlled operations dashboard with:

```bash
docker compose --profile observability up -d prometheus grafana
```

Open [Grafana](http://localhost:3000), or see the
[local observability runbook](../observability/README.md) for the complete topology
and Prometheus target status.

The observability runbook also covers the opt-in OpenTelemetry Collector and
Jaeger setup. Tracing remains disabled unless explicitly enabled in the Core
and Gateway; see the [observability runbook](../observability/README.md).

## Polling verification

Verify the complete `v0.6` polling and observability topology in an isolated,
self-cleaning Compose project with:

```bash
./scripts/verify-v0.6-compose.sh
```

## Stop the demo

From the repository root, `docker compose down` stops the stack while retaining
its named volumes. Removing those volumes also removes the stored demo data.
