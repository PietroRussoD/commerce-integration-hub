# Architecture Decisions

Architecture Decision Records capture significant choices that are costly or
risky to change. Their numbering records documentation order, not importance or
implementation chronology.

- [ADR 0001](0001-source-api-key-authentication.md): structured source
  API-key authentication.
- [ADR 0002](0002-sql-first-postgresql-persistence.md): SQL-first PostgreSQL
  persistence.
- [ADR 0003](0003-idempotent-order-ingestion.md): payload-aware idempotent
  order ingestion.
- [ADR 0004](0004-transactional-outbox.md): transactional outbox persistence.
- [ADR 0005](0005-short-lived-outbox-claims.md): short-lived publisher claims,
  fencing, and recovery.
- [ADR 0006](0006-bounded-outbox-retries.md): bounded retries and terminal
  publication failures.
- [ADR 0007](0007-structured-event-envelope.md): structured JSON events with
  Kafka routing metadata derived from the same envelope.
- [ADR 0008](0008-transactional-inbox-order-processing.md): transactional inbox
  and atomic effects for idempotent order processing.
- [ADR 0009](0009-bounded-consumer-retries-and-dead-letter-routing.md): bounded
  consumer retries, permanent failure classification, and dead-letter routing.
- [ADR 0010](0010-node-typescript-fastify-gateway.md): Node.js, strict
  TypeScript, and Fastify for the provider-facing Connector Gateway.
- [ADR 0011](0011-gateway-postgresql-kysely-persistence.md): gateway-owned
  PostgreSQL delivery state with Kysely migrations and repository adapters.
- [ADR 0012](0012-short-lived-gateway-delivery-claims.md): bounded,
  non-blocking gateway delivery claims with short leases and fencing tokens.
- [ADR 0013](0013-classify-integration-core-http-outcomes.md): bounded and
  typed Integration Core HTTP outcome classification.
- [ADR 0014](0014-bound-gateway-delivery-retries.md): bounded delivery attempts,
  age, equal-jitter delays, and capped `Retry-After` scheduling.
- [ADR 0015](0015-rebuildable-opensearch-order-projection.md): rebuildable
  OpenSearch order projection with PostgreSQL authority and alias-based reindex.
- [ADR 0016](0016-version-order-state-and-evolve-ready-event.md): persisted
  aggregate versions and `OrderReady.v2` for stale-event protection.
- [ADR 0017](0017-single-repository-version.md): one repository version for
  every deployable module, enforced by an automated check.
- [ADR 0018](0018-safe-opensearch-reindex-cutover.md): dual-write OpenSearch
  rebuild, validation, and atomic read-alias cutover.
- [ADR 0019](0019-protect-operator-apis-with-external-jwt.md): external OIDC
  bearer tokens, JWKS validation, and operator/platform-admin authorization.
- [ADR 0020](0020-distributed-tracing-with-opentelemetry.md): OpenTelemetry
  traces across HTTP, Kafka, and durable work boundaries; local Jaeger viewer.
- [ADR 0021](0021-local-kubernetes-deployment.md): optional local
  Kubernetes environment with kind, CloudNativePG, Redpanda, and Istio ambient.
- [ADR 0022](0022-synchronous-postgresql-replication.md):
  synchronous `preferred` replication for the Kubernetes PostgreSQL clusters,
  with measured latency and availability trade-offs.
- [ADR 0023](0023-ambient-mesh-and-application-retries.md): Istio
  ambient mesh, strict mutual TLS, authorization by workload identity, a Gateway
  API ingress, and retries kept in the applications.
- [ADR 0024](0024-terminal-gateway-payload-retention.md): clear expired terminal
  Gateway payloads while retaining active work, deduplication and audit; schema
  invariants and opt-in terminal-only cleanup implemented.

Accepted records are not edited to hide a later change of direction. Later
extensions or replacements are recorded in a new ADR and linked to the earlier
decision.
