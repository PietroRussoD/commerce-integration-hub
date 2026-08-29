# ADR 0010: Use Node.js, TypeScript, and Fastify for the Connector Gateway

- Status: Accepted
- Date: 2026-08-29

## Context

The Connector Gateway is a provider-facing deployable that receives webhooks,
polls external APIs, persists technical deliveries, and forwards canonical
commands to the Integration Core. It needs strict input validation, raw-body
access for signature verification, structured logging, and fast HTTP tests.

The gateway is an integration boundary, not a second implementation of the
order domain. Framework concerns must remain at its HTTP and process edges.

## Decision

Use Node.js 24 LTS, TypeScript 6.0.3 in strict mode, and Fastify 5 for the
Connector Gateway.

Fastify owns HTTP routing, request and response schemas, serialization,
structured request logging, lifecycle hooks, and in-process HTTP testing through
`inject`. The application factory is separate from the process bootstrap so
tests do not need to open a network port.

Provider authentication and mapping are framework-independent; persistence,
retry decisions, and forwarding follow the same boundary as they are added.
Fastify types must not cross the inbound HTTP adapter into those components.

## Alternatives

- **Node.js HTTP APIs directly:** rejected because routing, schemas, lifecycle,
  logging, and test injection would require custom infrastructure.
- **Express:** rejected because equivalent schema validation, serialization,
  structured logging, and injection testing would require more assembly and
  conventions.
- **NestJS:** rejected because its module, decorator, and dependency-injection
  model adds more framework surface than this bounded gateway requires.
- **Add the provider boundary to the Kotlin core:** rejected because it would
  mix provider-specific transports and delivery recovery with the canonical
  order service.

## Consequences

The gateway gains a small, typed HTTP boundary with deterministic tests and
production-oriented logging. JSON Schemas become part of endpoint design rather
than optional documentation.

Fastify remains a deployable-edge dependency that must be upgraded and tested.
Its plugin and lifecycle model require explicit understanding, and the team
must prevent convenience APIs from coupling application logic to the framework.
