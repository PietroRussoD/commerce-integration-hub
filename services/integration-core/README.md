# Integration Core

The Integration Core will own the canonical order model and reliable ingestion
workflow.

The current increment contains the Quarkus/Kotlin baseline, the initial order
domain and use case, PostgreSQL schema management with Flyway, a jOOQ repository
adapter, automated tests, health checks, Swagger UI, and generated OpenAPI
files.
It deliberately has no messaging or search components yet.

The PostgreSQL schema currently contains `orders` and `order_items`. Item
constraints and relationships are verified against PostgreSQL, but the order
repository does not persist items yet; that mapping belongs to the next
executable increment.

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

The domain does not import Quarkus, jOOQ, Flyway, or transport classes.
Application code defines the `OrderRepository` port because persistence is a
real I/O boundary. `JooqOrderRepository` implements that port and contains the
current transactional database operation. Framework-free domain and application
tests use direct construction or an in-memory repository; PostgreSQL behavior is
verified separately through Quarkus integration tests.

jOOQ-generated sources live under `target/generated-sources/jooq` and are not
committed. New packages and ports are added only when an implemented behavior
creates a concrete boundary; the project deliberately avoids placeholder layers
and `Service`/`ServiceImpl` pairs.

## Monetary policy

The current order-item domain model supports `EUR`, `GBP`, and `USD`. A unit
price carries its currency explicitly and may have up to four fractional digits.
The line amount is calculated as `quantity * unitPrice` and rounded to the
currency minor unit using `HALF_UP`; callers cannot supply a separate line
amount.

The receive-order use case validates the command's canonical uppercase currency
code. The order owns that currency and the repository persists it in PostgreSQL,
where a check constraint provides a final consistency guard.

The service keeps each order in its original currency and does not perform
foreign-exchange conversion. Order-level total validation will be added when
order items are connected to the persisted order aggregate.

## Prerequisites

- Java 21 or newer
- Docker for development and integration tests

## Build

```bash
./mvnw verify
```

Running `clean verify` also regenerates the jOOQ database sources and the
committed OpenAPI files:

```bash
./mvnw clean verify
```

Generated OpenAPI files:

- [OpenAPI YAML](src/main/resources/META-INF/integration-core.yaml)
- [OpenAPI JSON](src/main/resources/META-INF/integration-core.json)

jOOQ derives Kotlin table and record classes from the ordered Flyway migrations
under `src/main/resources/db/migration`. It writes them to
`target/generated-sources/jooq`; generated database sources are build artifacts
and are not committed.

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
