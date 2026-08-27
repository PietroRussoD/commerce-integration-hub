# Operator Console

React and TypeScript console for inspecting Commerce Integration Hub operations.
It provides a paginated order list, operational order details, and a controlled
canonical-ingestion simulator. API types are generated from the Integration
Core OpenAPI document and all HTTP access is isolated behind a tested client.

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

Open [http://localhost:5173](http://localhost:5173) after Vite starts. The order
list and detail views use the read-only operator API. The simulator requires a
source API key provisioned by the Integration Core administrative CLI.

## Component development

Run Storybook to develop and inspect shared UI components independently from
the application and backend:

```bash
pnpm storybook
```

Open [http://localhost:6006](http://localhost:6006). Component stories include
generated documentation, interactive controls, and accessibility checks. Build
the static component documentation with `pnpm build-storybook`; the complete
`pnpm check` quality gate also runs this build.

## Branding

The console resolves its brand from an exact hostname match before React
renders. `localhost` uses the default Integration Hub theme, while
[http://client-blue.localhost:5173](http://client-blue.localhost:5173) previews
the alternate client theme. Registered hostnames live in
`src/theme/brandThemes.ts`; their CSS tokens use matching `data-brand` selectors
in `src/styles.css`. Storybook exposes the same themes from its Brand toolbar.

## Simulator

The simulator submits one canonical order item and supports four controlled
scenarios:

- `Fresh order` creates a valid request with a new external ID;
- `Equivalent replay` resubmits the last accepted request unchanged;
- `Conflict` reuses that external ID with different valid content;
- `Invalid total` sends a fresh request whose declared total does not match its
  item.

Replay and conflict become available after one request is accepted. The source
API key remains only in React memory for the lifetime of the page and is sent in
the `X-Source-API-Key` request header. The simulator is a local development and
portfolio surface, not a production administration interface.

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
