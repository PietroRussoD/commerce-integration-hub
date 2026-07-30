# Integration Core

The Integration Core will own the canonical order model and reliable ingestion
workflow.

The current increment contains the Quarkus/Kotlin baseline, a technical service
metadata endpoint, automated tests, health checks, Swagger UI, and generated
OpenAPI files.
It deliberately has no order domain, database schema, or messaging components
yet.

## Prerequisites

- Java 21 or newer

## Build

```bash
./mvnw verify
```

Running `clean verify` also regenerates the committed OpenAPI files:

```bash
./mvnw clean verify
```

Generated OpenAPI files:

- [OpenAPI YAML](src/main/resources/META-INF/integration-core.yaml)
- [OpenAPI JSON](src/main/resources/META-INF/integration-core.json)

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

## Format

```bash
./mvnw spotless:apply
```
