# ADR 0020: Distributed Tracing With OpenTelemetry

- Status: Proposed
- Date: 2026-10-03

## Context

The existing correlation IDs and structured logs help locate related work, but
they do not show where one order spends time across the Connector Gateway,
Integration Core, PostgreSQL-backed work queues, Kafka consumers, and the
OpenSearch projection. Several transitions are asynchronous and resume after a
process restart, so ordinary in-process tracing cannot preserve causality by
itself.

The project already uses Prometheus for metrics and structured application
logs. This decision concerns distributed traces only; it does not replace those
signals or change business event contracts.

Isolated compatibility spikes passed on 2026-10-03, but did not use the running
applications. Quarkus 3.33.3 propagated an active trace through `MutinyEmitter`,
Kafka, and an `@Incoming` consumer with `TracingMetadata.withPrevious`. Node
26.0.0 with `@fastify/otel` 0.21.1 and OpenTelemetry JS SDK 0.222.0 propagated
one trace through a Fastify request, `fetch`, and a second local service. The
Node probe used API 1.9.1, HTTP instrumentation 0.222.0, Undici instrumentation
0.32.0, and trace SDK 2.11.0. The local Integration Core image exported an
automatically instrumented HTTP span to Jaeger 2.21.0 over OTLP on
2026-10-03. A local Compose smoke test also confirmed that a sampled operator
read request still returns `200` when the OTLP endpoint is unavailable; the
export failure is logged asynchronously. A separate Compose smoke test
confirmed that a Fastify liveness request creates a Gateway trace received by
Jaeger. The Connector Gateway's PostgreSQL-backed worker boundary is now
covered by an integration test; Core outbox propagation and Kafka remain to be
verified.

## Decision

Adopt OpenTelemetry APIs and SDKs for trace creation, instrumentation, context
propagation, and OTLP export in the Connector Gateway and Integration Core.
Use the framework-supported Fastify and Quarkus integrations rather than
hand-building HTTP or Kafka headers. Keep telemetry SDK types in infrastructure
adapters, not domain objects.

Use W3C Trace Context for internal HTTP and Kafka propagation. At provider
ingress, begin a locally owned trace rather than trusting an externally
supplied parent. Propagate context only between project-owned services; do not
propagate baggage. For work that crosses a durable boundary, persist nullable,
bounded trace context separately from business JSON and restore it when a
worker resumes. Existing rows and historical Kafka records without context
remain valid. Tracing metadata must not affect idempotency, fingerprints,
event payloads, or business outcomes.

For the Gateway delivery record and both Core outbox records, resume the
persisted context as the parent of a new span for each attempt or dispatch.
Never keep a span open while work waits in storage. Automatic retries are
sibling attempt spans under the persisted operation context. An explicit
administrative replay starts a new trace; linking it to the original context
is deferred until trace-link behavior is implemented and verified.

Create short-lived spans for actual work, not for the time a row waits in a
database. For Kafka, use the instrumentation's supported parent/link semantics
and make the observed behavior an integration-test assertion; do not rewrite
native instrumentation merely to force a preferred trace shape.

For local demonstration, use an optional Jaeger v2 all-in-one Compose service
with OTLP receivers and temporary in-memory storage. Applications export over
OTLP directly to Jaeger; defer a separate Collector until there is a concrete
need for routing or telemetry processing. The viewer is not required for
ordinary application startup or tests. Export is asynchronous and bounded;
viewer or exporter failure must not fail business processing. When tracing is
disabled, the applications must not emit spans or noisy connection errors.
Sampling and exporter endpoint are configuration, not business behavior.

Allow only bounded internal identifiers, attempt number, fixed operation and
outcome codes, and other explicitly reviewed attributes. Never record payloads,
webhook signatures, credentials, tokens, query values, or raw exception
messages. Review automatic instrumentation attributes as well as custom spans.

Expose an existing delivery attempt's trace ID and a Jaeger link in the
operator console only when a local viewer URL is configured. Do not add browser
instrumentation or a custom trace viewer. Keep the existing Flow Explorer as a
static walkthrough; Jaeger is the live trace viewer.

## Alternatives

- **Correlation IDs and logs only:** rejected for this demonstration because
  they require manual reconstruction across asynchronous boundaries and do not
  provide a causal timing view.
- **Vendor-specific tracing SDK or backend:** rejected to keep instrumentation
  and export based on open standards and avoid binding application code to a
  single viewer.
- **Add trace IDs to business payloads:** rejected because tracing is transport
  metadata and should not change event contracts or fingerprints.
- **Introduce an OpenTelemetry Collector immediately:** deferred because the
  local demonstration has one receiver and no routing or processing need.
- **Build browser tracing or a custom trace UI:** rejected as out of scope; the
  operator needs a deep link to the standard trace viewer, not another UI.

## Consequences

- The `v1.1.0` implementation adds operational visibility while preserving
  existing HTTP and event contracts. Persisted metadata changes must be
  additive and nullable.
- Integration tests must cover propagation through both durable outbox
  boundaries, Gateway delivery retries, Kafka, worker restart, missing context,
  and viewer/exporter failure. Existing database and Kafka fixtures remain the
  basis; Jaeger is not a mandatory CI dependency.
- Local traces are ephemeral. The demonstration must explain that restarting
  Jaeger clears its in-memory trace history.
- Automatic instrumentation can create duplicate spans or expose attributes
  that are not appropriate for the demo. Review the emitted trace before
  enabling it by default.
- The first implemented durable hop creates a locally rooted Gateway receipt
  span after webhook authentication and validation, discarding any provider
  `traceparent` or `tracestate`. It persists only nullable `traceparent` and
  `tracestate` columns, then creates a short-lived worker attempt span and
  propagates its W3C context to Integration Core. The attempt trace ID is stored
  with the delivery-attempt record. Poll-originated work without a stored parent
  starts a new trace when tracing is enabled. An operator replay clears the
  previous delivery context; the original attempt trace ID remains available
  in attempt history, but no trace link is created.
- A process-level integration test verifies the PostgreSQL migration, durable
  context restoration, a distinct child span ID, and propagation on the Core
  HTTP request. The rest of the Core outbox and Kafka path is still pending.
- This ADR remains Proposed until the real application configuration,
  propagation tests, and privacy review validate these constraints.
