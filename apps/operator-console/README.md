# Operator Console

React and TypeScript console for inspecting Commerce Integration Hub operations.
The current increment provides the application shell, a paginated order summary
view with status filtering, generated API types, and a tested HTTP client. The
order detail view and demo simulator are separate increments.

## Prerequisites

- Node.js 24 or newer, below Node.js 27
- pnpm 11.23.0
- A current Integration Core OpenAPI document

## Development

Install dependencies and start Vite:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Requests under `/api` are proxied to `http://localhost:8080`. Override the
backend during development with `VITE_INTEGRATION_CORE_PROXY_TARGET`.

Run the complete local quality gate:

```bash
pnpm check:api
pnpm check
```

`pnpm check` enforces the configured Vitest coverage thresholds. Open the local
HTML report at `coverage/index.html`. CI retains the same report for 14 days as
the `operator-console-coverage` artifact, including when a later test or
coverage gate fails.

## API types

`src/api/generated/integration-core.ts` is generated from the committed
Integration Core OpenAPI document and is also committed. Regenerate it after an
API contract change:

```bash
pnpm generate:api
```

Application code accesses the backend through `src/api/integrationCoreClient.ts`
rather than importing transport details into page components.
