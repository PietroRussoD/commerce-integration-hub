# Connector Gateway

Provider-facing Node.js and TypeScript service for the Commerce Integration Hub.
The current baseline exposes a health endpoint and contains framework-independent
`MARKETPLACE_A` raw-body signature validation, timestamp-freshness validation,
and current/previous verification-key selection. A framework-independent
authenticator composes these checks and reports bounded internal failure reasons.
Strict environment parsing is available for Base64 secrets, rotation settings,
and the bounded freshness tolerance. A composition root builds the complete
authenticator once from that validated configuration. A connector-scoped Fastify
parser preserves exact JSON bytes, enforces a 1 MiB limit, and rejects other
media types without changing parsers outside that scope. The provider route
adapter maps every authentication failure to the same `401` problem response and
fails closed with `503` after successful authentication until durable receipt is
implemented. A strict Ajv contract parser validates authenticated provider JSON
without coercion, defaults, or unknown-field removal; malformed JSON and schema
violations map to one generic `400` problem response. The route is not registered
by the running application yet.
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
