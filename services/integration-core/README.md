# Integration Core

The Integration Core will own the canonical order model and reliable ingestion
workflow.

The current increment contains the Quarkus/Kotlin baseline, the initial order
domain and use case, PostgreSQL schema management with Flyway, a jOOQ repository
adapter, automated tests, health checks, Swagger UI, and generated OpenAPI
files.
It deliberately has no messaging or search components yet.

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
