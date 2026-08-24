# Operator Console

React and TypeScript console for inspecting Commerce Integration Hub operations.
The current increment provides the application shell, a paginated order summary
view with status filtering, generated API types, and a tested HTTP client. The
order detail view and demo simulator are separate increments.

## Prerequisites

- Node.js 24 or newer, below Node.js 27
- A current Integration Core OpenAPI document

## Development

Install dependencies and start Vite:

```bash
npm ci
npm run dev
```

Requests under `/api` are proxied to `http://localhost:8080`. Override the
backend during development with `VITE_INTEGRATION_CORE_PROXY_TARGET`.

Run the complete local quality gate:

```bash
npm run check:api
npm run check
```

## API types

`src/api/generated/integration-core.ts` is generated from the committed
Integration Core OpenAPI document and is also committed. Regenerate it after an
API contract change:

```bash
npm run generate:api
```

Application code accesses the backend through `src/api/integrationCoreClient.ts`
rather than importing transport details into page components.
