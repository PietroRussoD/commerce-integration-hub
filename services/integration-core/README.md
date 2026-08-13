# Integration Core

The Integration Core owns the canonical order model and reliable ingestion
workflow.

The current increment implements a currency-aware order aggregate, its
receive-order use case, and transactional PostgreSQL persistence through Flyway
and jOOQ. It includes automated tests, health checks, Swagger UI, and committed
OpenAPI files. Messaging and search are not implemented yet.

The service persists a canonical payload fingerprint with each order. Reusing a
source identity returns `ALREADY_RECEIVED` for equivalent content and
`PAYLOAD_CONFLICT` when the payload differs.

## Architecture

The service uses a lightweight hexagonal architecture. Packages reflect actual
responsibilities rather than a fixed number of layers:

```text
dev.pietrorussod.integrationhub/
  api/                         HTTP resources and transport DTOs
  application/order/           use cases, commands, results, and outbound ports
  domain/order/                entities, value objects, and business invariants
  infrastructure/persistence/  PostgreSQL adapters
    jooq/                       jOOQ repository and record mapping
```

Dependencies point inward:

```text
api ----------------> application ----------------> domain
infrastructure -----> application and domain
domain ------------> Kotlin and Java standard libraries only
```

The domain has no framework or transport dependencies. The application layer
defines the `OrderRepository` port; `JooqOrderRepository` implements it and owns
the transactional database operation. Domain and application tests remain
framework-free, while PostgreSQL behavior is covered by integration tests.

New packages and ports are introduced only for concrete boundaries. jOOQ sources
are generated under `target/generated-sources/jooq` and are not committed.

## Monetary policy

- Supported currencies: `EUR`, `GBP`, and `USD`.
- Unit prices carry their currency and support up to four fractional digits.
- Line amounts are `quantity * unitPrice`, rounded to the currency minor unit
  with `HALF_UP`.
- The order total is the sum of the rounded line amounts.
- The declared total must be non-negative, use the order currency, fit its minor
  unit, and equal the calculated total.
- Calculated amounts are persisted and revalidated when restored.
- Orders remain in their original currency; there is no FX conversion.

## Payload fingerprinting

Version 1 hashes validated order content with SHA-256. It includes currency,
calculated total, item count, and each item's external line ID, SKU, description,
quantity, and unit price in meaningful order. Source identity, internal IDs,
status, and server-generated timestamps are excluded.

The binary representation has a fixed field order, embeds its version, uses
length-prefixed UTF-8 strings, marks nullable values explicitly, and normalizes
decimals. A golden-hash test guards against accidental format changes.

## Prerequisites

- Java 21 or newer
- Docker for development and integration tests

## Build

Run the fast, framework-free unit tests:

```bash
./mvnw test
```

Run the complete build, including `*IT` tests with Quarkus and PostgreSQL:

```bash
./mvnw verify
```

Use `clean verify` to regenerate jOOQ sources and the committed OpenAPI files:

```bash
./mvnw clean verify
```

Generated OpenAPI files:

- [OpenAPI YAML](src/main/resources/META-INF/integration-core.yaml)
- [OpenAPI JSON](src/main/resources/META-INF/integration-core.json)

jOOQ derives Kotlin table and record classes from the ordered Flyway migrations
under `src/main/resources/db/migration`.

## Run

```bash
./mvnw quarkus:dev
```

Runtime API documentation:

```text
http://localhost:8080/openapi/integration-core
http://localhost:8080/openapi-ui/integration-core/
```

Operational endpoints:

```text
http://localhost:8080/health
http://localhost:8080/health/live
http://localhost:8080/health/ready
```

## Container Image

Build the Quarkus application first:

```bash
./mvnw clean verify
```

Build the JVM container image:

```bash
docker build \
  -f src/main/docker/Dockerfile.jvm \
  -t commerce-integration-hub/integration-core:dev \
  .
```

Run it locally:

```bash
docker run --rm \
  --name integration-core \
  -p 8080:8080 \
  -e DB_JDBC_URL=jdbc:postgresql://host.docker.internal:5432/integration_hub \
  -e DB_USERNAME=integration_hub \
  -e DB_PASSWORD=change-me \
  commerce-integration-hub/integration-core:dev
```

The production profile requires an accessible PostgreSQL database through
`DB_JDBC_URL`, `DB_USERNAME`, and `DB_PASSWORD`. Development mode and tests use
a PostgreSQL Dev Service managed by Quarkus.

CI publishes images to GitHub Container Registry:

```text
ghcr.io/pietrorussod/commerce-integration-hub/integration-core:latest
ghcr.io/pietrorussod/commerce-integration-hub/integration-core:v<version>
```

Publishing rules:

- pull requests build the image but do not push it;
- pushes to `main` publish `latest`;
- Git tags matching `v*` publish the corresponding version tag.

## Format

```bash
./mvnw spotless:apply
```
