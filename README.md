# Commerce Integration Hub

Reliable platform for ingesting, normalizing, and tracking orders from external
systems.

## Current status

The repository currently contains the build baseline for the Kotlin Integration
Core. No order-ingestion behavior is implemented yet.

The baseline establishes:

- a Java 21 compilation target;
- Kotlin and Quarkus LTS;
- a reproducible Maven Wrapper;
- automated formatting checks;
- GitHub Actions validation.

Database persistence, HTTP APIs, messaging, search, external connectors, and
user interfaces will be added as separate executable increments.

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
