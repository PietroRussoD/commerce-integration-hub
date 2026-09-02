# Provider Simulator

Deterministic local-only provider used to demonstrate and test Connector Gateway
integration behavior. It contains synthetic fixtures and no business logic from
the Gateway.

## Run

```bash
pnpm install --frozen-lockfile
PROVIDER_SIMULATOR_ERP_B_API_TOKEN=local-token pnpm dev
```

The server listens on port `8080` by default. `GET /health` is public. The
authenticated `GET /erp-b/v1/orders?limit=2` endpoint returns deterministic
valid and poison fixtures through cursor pagination. See the
[`ERP_B` polling diagrams](../../docs/erp-b-polling.md) for how those pages move
through the Gateway and become durable delivery and checkpoint records.

## Validate

```bash
pnpm check
```
