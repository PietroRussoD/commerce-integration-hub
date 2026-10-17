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
verify the signature. The token is sent as a bearer credential to all four Core
operator reads (list, detail, search status, and projected search) and to Gateway
operator requests. Each service independently verifies it and enforces
authorization when operator security is enabled. Core reads remain available
without a token in an unprotected local profile. Applying a different token or
removing it gives Core queries a fresh cache scope, including when the subject
is unchanged; bearer credentials are never part of their cache keys. Core
`401` and `403` responses show distinct access messages and are not automatically
retried. Source ingestion continues to use its separate source API key.

The delivery views provide payload-free delivery summaries and attempt history from the Gateway. A `platform-admin` can submit a
reasoned, idempotent replay command for an eligible exhausted delivery. The
simulator requires a source API key provisioned by the Integration Core
administrative CLI.

### Delivery list navigation

The delivery list stores `provider`, `status`, and the current opaque `cursor`
in the URL. Delivery links and the detail's return link carry that context,
including through reload and browser Back/Forward. The API receives only the
current cursor; the console neither decodes it nor calculates page numbers or a
total count. Changing either filter resets the cursor.

Previously visited cursors belong to the browser history entry, which is carried
through the detail view and survives reload. A copied URL restores the current
page, but has no adjacent-page history: Previous page stays disabled and First
page remains available. First page also recovers an empty page after the dataset
changes, keeping the current filters. Tokens remain memory-only and must be
supplied again after a reload or when opening a copied URL.

A Gateway `400` on a cursor-based list read offers First page and stops automatic
retries. The Gateway's generic validation response does not identify an invalid
cursor separately from other rejected parameters, so the UI describes a rejected
page request without claiming expiry. Authentication failures retain their token
recovery action; transient failures retain Retry. Paging waits for the current
read to settle before reusing its next cursor. Chromium navigation checks use
synthetic credentials and API responses, separately from the Gateway's cursor
codec, route and database integration tests.

### Simulator submission lifecycle

The simulator locks its fields and all scenario actions while an order submission
is pending. A synchronous guard also rejects repeated submission and editing
handlers before React renders the disabled controls. POST requests are never
automatically retried. Both success and failure release the lock.

The response retains a read-only summary of the submitted external ID, currency,
declared total and item values. Editing the draft or choosing another scenario
keeps that response and marks it as belonging to the submitted order. Previous
validation errors remain in the response summary but are not attached to changed
draft fields. No source API key is rendered in the summary. Equivalent replay and
conflict scenarios continue to use the last accepted request.

This state belongs to the mounted simulator page; leaving the page does not
cancel a POST already sent and loses its local feedback. The simulator does not
provide cross-page command recovery. Unit tests exercise synchronous duplicate
submission and scenario guards, failure recovery and response attribution.
Chromium checks use delayed, synthetic API responses at desktop, tablet and
smartphone widths, including Italian, and do not ingest orders into a live Core.

### Token expiry and access recovery

The token dialog displays the declared subject, recognized operational roles and
expiry in local time. These claims are not verified by the browser. The dialog
also explains the memory-only policy and each service's independent validation.
An expiry timer removes the credential and identity, hides authenticated Gateway
content and switches to a fresh anonymous cache scope. Focus and visibility
changes recheck the clock after suspended or delayed timers; long expiries do not
overflow the browser timeout. Already submitted replay requests keep running and
remain associated with their originating session.

Core and Gateway access errors offer a direct action to open the shared token
dialog. Gateway `401` means the credential was not accepted; `403` means the
operation was denied. Both stop automatic query retries and hide cached Gateway
rows, detail and replay controls. A service rejection does not clear the token
globally, since the other service may independently accept it. Applying a different
valid token starts fresh queries in a new scope. Reusing the same rejected token
does not create a new session. Replay authentication or permission errors also
offer token recovery without opening two modal dialogs or automatically resending
the command. Replacing a token does not transfer an unresolved command intention
between sessions; the recovery policy below still applies.

Unit tests cover exact expiry, renewal, long timers, background clock changes and
confirmation before a delayed expiry timer. Chromium tests cover cached Gateway
reads rejected with `401`/`403`, credential replacement for both services, replay
access errors, expiry during a pending POST, late-response isolation and loss of
the credential on reload. Browser API responses and JWTs are synthetic; these
checks do not verify a live OIDC login or a browser-to-backend authenticated flow.

### New send attempts

The **Request a new send attempt** section explains the requirements to all
read-authorized operators. A new request requires `platform-admin`, delivery
status `EXHAUSTED`, connector status `ACTIVE`, a retained original payload, and a
retention deadline later than the current time. Unmet requirements are listed
beside the disabled action, including missing or unverifiable retention metadata.
The payload summary distinguishes physical absence from retention expiry.

Eligibility updates at the retention deadline and when returning to the page;
confirmation checks the wall clock again in case background timers were delayed.
An open form preserves its reason while conditions change and disables a new
submission. These checks use the displayed Gateway snapshot and browser clock;
the Gateway independently checks the real command and remains authoritative.
An explicit recognized replay `409` shows a localized explanation and refreshes
only the originating session's list/detail. New requests wait for that read to
complete; if it fails, retrying the detail read is required before a new command.
Previous attempts remain counted, and acceptance confirms requeueing
rather than the outcome of the subsequent send.

Recovering a previously sent command is a separate action: an authorized
administrator can still resolve its outcome with the same key and reason when
the delivery state, connector or payload no longer permits a new send attempt.
The Gateway resolves the existing audited command before applying new-request
guards. Browser tests use synthetic data to cover roles, delivery and connector
states, missing/expired payloads, expiry during editing, concurrent rejections,
and recovery after expiry. Unit tests also exercise delayed timers and the exact
retention boundary; no real replay command is sent by the browser suite.

### Pending replay requests

Replay requests are tracked above the routes for the lifetime of the loaded
console. Closing and reopening the dialog preserves a pending request and its
reason. Navigating within the console, replacing the token, or removing it does
not cancel a POST already sent. A shared synchronous lock prevents a second
request for the same delivery until the first HTTP request settles, including
after navigation or a token change. Different deliveries can be requested
independently; POSTs are never automatically retried.

A live status notice across pages explains pending requests without exposing
delivery IDs, reasons, or credentials from another session. On completion,
delivery list and target detail caches are invalidated only for the initiating
session, even if its page has unmounted. Gateway reads now use the same opaque
session scopes as Core reads; tokens are not included in their cache keys, and
list placeholders are not carried across session changes.

This tracking is in memory: reloading, closing the tab, or leaving the console
loses it and cannot undo a server-side command. The notice explains this limit.
The delivery detail keeps the last confirmed replay response and command ID
outside the conditional replay control. It survives closing the dialog,
navigation back to that detail, and the refreshed delivery leaving `EXHAUSTED`.
The response remains visible while the detail loads or its refresh fails.
An open dialog remains available until dismissed, with focus returning to the
main content when its trigger is no longer available. Opening a new draft keeps
the previous confirmation; confirming a new intention replaces it.

`REPLAYED` confirms that the delivery was requeued. The current delivery status
and attempt history describe subsequent sending outcomes. `IN_PROGRESS` reports
that the Gateway registered the command and its result is still pending. The
feedback explicitly distinguishes these responses from a successful delivery.
Both responses remain scoped to the originating token session; a replacement
token never displays another session's confirmation. Browser tests verify this
behavior with synthetic responses at 320 and 1440 pixels.

### Recovering an unconfirmed replay

The Console creates one idempotency key when an operator confirms a replay
intention. Network failures, server errors, unrecognized errors, or invalid
acceptance responses leave its outcome unconfirmed: the Gateway may already
have accepted the command. Closing/reopening the dialog or navigating within
the same token session preserves the key and the trimmed reason. The recovery
form keeps that reason read-only and offers **Retry the same request**. No
automatic replay retry is performed.

The same action can check an `IN_PROGRESS` command again. Recovery remains
available to a platform-admin even when the delivery is no longer `EXHAUSTED`,
because the Gateway resolves a known command before checking replay eligibility.
An authorization or validation failure during recovery cannot resolve an earlier
uncertain outcome. A recognized audited replay rejection does resolve it.
After an explicit rejection, a new confirmation is a new intention and receives
a new key, even for the same delivery and reason. An unresolved intention must
be resolved before its reason can change.

Command metadata is isolated by the opaque token-session scope and delivery.
Replacing or removing the token does not transfer a recovery intention or its
key into the new session, even when the claimed subject is unchanged. Records
from separate sessions cannot overwrite each other, and the in-flight delivery
lock still applies across sessions. Metadata stays in memory, with no bearer
credential in the registry or browser storage; reload loses recovery metadata.

`pnpm test:e2e` covers this flow with synthetic APIs, including a simulated
server acceptance followed by a lost HTTP response. It does not send real
Gateway replay commands. The Gateway integration suite separately checks the
database-backed replay and idempotency rules.

With the Integration Core OpenSearch profile enabled, the Orders page enables
projected-order search only after the status endpoint reports the read alias as
available. Operators can search item descriptions, an exact external order ID,
or an exact SKU.

The search projection's availability is summarized above the search controls.
Its polling, reconciliation and reindex diagnostics are available in a closed
by-default disclosure, keeping the order list near the start of the page. The
native disclosure remains keyboard operable and exposes all diagnostic values
when opened. If status is unavailable, the concise message and complete order
list remain visible; the search controls report their own unavailable state.

### Order list and search scope

Orders shows one active scope: the complete Core order list, or indexed search
after search criteria are submitted. The status filter, header count, pagination
and Refresh action apply to that scope. Indexed search can lag behind the Core
and only contains projected orders; it is not an authoritative list of every
received order. The search summary shows applied criteria, and editing fields
marks an unapplied draft without changing results or Refresh behavior.

The URL stores `status`, complete-list `offset`, search criteria (`q`,
`externalOrderId`, `sku`) and search `searchOffset`. A nonblank search criterion
selects indexed search. Detail links and the return link carry this context;
reload, copied URLs and browser Back/Forward restore it. Changing status resets
both offsets. Submitting new criteria or returning to the complete list resets
paging, while keeping the status filter. Older URLs containing both offsets
remain readable; only the active scope's offset is used.

Changing pages clears rows from the previous offset until the requested page
arrives. A delayed read shows a loading status; when cached rows for the same
scope and page are being refreshed, the results region is marked busy and page
controls are disabled. A live announcement reports the new range or empty state
after the request finishes. Changing the status filter remains possible during
a pending page request and discards its old offset.

An unavailable index or failed projection-status read disables search without
blocking the complete list. An active search keeps its criteria and offers an
explicit Complete order list action rather than silently replacing results.
Refresh rechecks projection availability and resumes an active search when it
becomes available. Counts and cached results are hidden while its availability
is unconfirmed or unavailable. Chromium acceptance tests use synthetic API
responses; they do not verify a live OpenSearch deployment.

The order detail uses the external order ID and source as its page heading,
explains the Core-reported order state, and keeps the internal UUID and timeline
correlation IDs in a keyboard-operable technical-details disclosure. Quantities
are locale-formatted without discarding meaningful decimal precision. The
processing-attempt section describes Integration Core records and distinguishes
them from Connector Gateway delivery attempts. The page has an explicit refresh
action and shows the time of its last successful read. During a refresh, current
details remain visible and the refresh control is disabled. If a read fails, the
page explains that the displayed data is from the previous successful read. It
does not poll automatically; the operator can refresh when needed. Timeline
times include seconds, meaningful milliseconds and the browser's local timezone;
each event can expose and copy its exact ISO-8601 timestamp. Browser tests use
synthetic API responses and do not verify a live Integration Core.

The delivery detail can also be refreshed explicitly and reports the last
successful read. After a confirmed replay response, it polls the delivery every
three seconds while its status is `RECEIVED`, `RETRY_WAIT` or `FORWARDING`, and
stops when the Gateway reports a terminal status. Background polling pauses
when the page is hidden. The replay confirmation remains available separately
from the refreshed delivery state. A failed read keeps prior details visible
with an explanation unless the Gateway rejects access. Browser tests use
synthetic Gateway responses and do not verify a live Gateway.

## Dialog accessibility

The access-token and delivery-replay dialogs use native modal dialogs with
explicit initial focus, Tab/Shift+Tab wrapping, Escape dismissal, and focus
restoration to the opening control. If that control has been removed, focus
returns to the main content. Validation messages are associated with their
fields; request failures are described without marking a valid reason invalid.
The dialogs scroll within short viewports and prevent background interaction.
The interaction follows the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

`pnpm test:e2e` checks these interactions in Chromium at 320, 768, and 1440 pixels
using synthetic API responses. The unit-test DOM only stubs the native dialog
methods; it does not verify browser modality or keyboard containment.

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
