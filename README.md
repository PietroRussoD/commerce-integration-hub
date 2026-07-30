# Commerce Integration Hub

Reliable platform for ingesting, normalizing, and tracking orders from external
systems.

## Current status

The repository currently contains the Kotlin Integration Core baseline with a
technical service metadata endpoint, automated tests, generated OpenAPI
files, and Swagger UI.

The current baseline establishes:

- a Java 21 compilation target;
- Kotlin and Quarkus LTS;
- a reproducible Maven Wrapper;
- automated formatting checks;
- GitHub Actions validation;
- a first HTTP endpoint;
- generated and committed OpenAPI files.

Order ingestion, database persistence, messaging, search, external connectors,
and user interfaces will be added as separate executable increments.

## Repository structure

```text
services/
  integration-core/  Kotlin/Quarkus authoritative order service
```

## Build

```bash
cd services/integration-core
./mvnw verify
```

See [Integration Core](services/integration-core/README.md) for service-level
details.
