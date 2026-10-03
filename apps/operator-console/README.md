# Operator Console

React and TypeScript console for inspecting Commerce Integration Hub operations.
It provides paginated order and Gateway delivery inspection, optional
projected-order search, operational order details, a controlled
canonical-ingestion simulator, and a Flow Explorer that replays recorded
integration evidence. Its System Map explains the implemented component topology
and links to the corresponding technical sources. API types are generated from
the Integration Core and Connector Gateway OpenAPI documents, and all HTTP
access is isolated behind tested clients.

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

Requests under `/api` are proxied to `http://localhost:8080`. Requests under
`/gateway-api` are proxied to `http://localhost:8081`, with the local prefix
removed before forwarding. Override either backend during development with
`VITE_INTEGRATION_CORE_PROXY_TARGET` or `VITE_CONNECTOR_GATEWAY_PROXY_TARGET`.
Set `VITE_JAEGER_UI_URL` in the Vite environment (see `.env.example`) to the
browser-reachable Jaeger URL to show trace links in delivery attempt history.
When unset, trace IDs and links are not rendered.

Open [http://localhost:5173](http://localhost:5173) after Vite starts. The order
list and detail views use the read-only operator API. The Deliveries navigation
item appears after a non-expired JWT with an `operator` or `platform-admin`
`groups` claim is supplied through the header control; the token is held only in
page memory. The Console inspects these claims only to shape its UI and does not
verify the signature. The Gateway independently verifies the token and enforces
authorization. The delivery views provide payload-free delivery
summaries and attempt history from the Gateway. A `platform-admin` can submit a
reasoned, idempotent replay command for an eligible exhausted delivery. The
simulator requires a source API key provisioned by the Integration Core
administrative CLI.

With the Integration Core OpenSearch profile enabled, the Orders page enables
projected-order search only after the status endpoint reports the read alias as
available. Operators can search item descriptions, an exact external order ID,
or an exact SKU.

## Flow Explorer

Open [http://localhost:5173/flow-explorer](http://localhost:5173/flow-explorer)
to replay the committed, sanitized FlowTrace artifacts. Select a scenario, use
the playback controls or timeline, and inspect the active participant transition
and captured technical evidence. The page reads versioned static artifacts; it
does not trigger live integration activity or expose production control APIs.

Autoplay respects the system reduced-motion setting. Timeline steps support
arrow keys, `Home`, and `End` for keyboard inspection. Capture provenance,
contract boundaries, and regeneration commands are documented in the
[Flow Explorer guide](../../docs/flow-explorer.md).

## System Map

Open [http://localhost:5173/system-map](http://localhost:5173/system-map) for
an interactive reference of the implemented topology. Selecting a component
shows its role, interfaces, and a link to the repository document
that supports the description. The page is static architecture reference; it
does not report live runtime state or issue control commands.

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
the alternate client identity and theme. Registered hostnames, product names,
logos, document titles, and browser colors live in `src/theme/brandThemes.ts`;
their CSS tokens use matching `data-brand` selectors in `src/styles.css`.
Storybook exposes the same themes from its `Brand` toolbar.

## Localization

English is the default and fallback locale. English and Italian resources are
bundled from `src/locales`; the header selector applies the locale immediately
and persists it in browser storage. Dates, money, and durations follow the
active locale. Storybook exposes both languages from its `Locale` toolbar.

## Accessibility

The console targets WCAG 2.2 Level AA without making a formal conformance claim.
See the [accessibility plan](../../docs/accessibility.md) for automated coverage,
current evidence, and the remaining manual audit checklist.

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

Browser-level tests use Playwright with Chromium. Operator API calls, including
the platform-admin Gateway replay flow, have deterministic mocked responses;
the Gateway integration suite separately verifies RS256 and JWKS validation.
The Flow Explorer reads committed trace artifacts. Install the browser once,
then run the suite locally:

```bash
pnpm test:e2e:install
pnpm test:e2e
```

Playwright starts Vite automatically on port `4173`. Use `pnpm test:e2e:ui`
for interactive debugging and `pnpm test:e2e:report` to open the latest HTML
report. Screenshots and traces are retained only for failures. These browser
tests are intentionally local and are not part of the GitHub Actions workflow.

`pnpm check` enforces the configured Vitest coverage thresholds. Open the local
HTML report at `coverage/index.html`. CI retains the same report for 14 days as
the `operator-console-coverage` artifact, including when a later test or
coverage gate fails.

## API types

The committed generated clients are:

- `src/api/generated/integration-core.ts`, generated from the Integration Core
  OpenAPI document;
- `src/api/generated/connector-gateway.ts`, generated from the Connector
  Gateway OpenAPI document.

Regenerate both after an API contract change:

```bash
pnpm generate:api
```

Application code accesses the backends through
`src/api/integrationCoreClient.ts` and `src/api/connectorGatewayClient.ts`
rather than importing transport details into page components.
