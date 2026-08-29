# Connector Gateway

Provider-facing Node.js and TypeScript service for the Commerce Integration Hub.

Current implemented scope:

- health endpoint and graceful process lifecycle;
- strict `MARKETPLACE_A` raw-body authentication with timestamp freshness and
  bounded current/previous key rotation;
- connector-scoped 1 MiB raw JSON parsing, strict provider validation, generic
  `401`/`400`/`422` Problem Details responses, and exact canonical mapping;
- readonly receipt-command creation with the validated provider JSON, mapping
  version, canonical order, and raw-byte SHA-256 fingerprint.

The provider route is tested but not registered by the running application.
Authenticated valid requests fail closed with `503` until durable receipt is
implemented.

The runtime and framework boundary are documented in
[ADR 0010](../../docs/decisions/0010-node-typescript-fastify-gateway.md).

## Requirements

- Node.js 24 or newer, below Node.js 27;
- pnpm 11.23.0.

## Validate

```bash
pnpm install --frozen-lockfile
pnpm check
```

## Run

```bash
pnpm dev
```

The service listens on `0.0.0.0:8081` by default. Override the bind address
with `HOST` and the port with `PORT`.

```bash
curl http://localhost:8081/health
```

```json
{"status":"UP"}
```
