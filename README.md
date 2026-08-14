# Commerce Integration Hub

Reliable platform for ingesting, normalizing, and tracking orders from external
systems.

## Current status

The repository currently contains the Kotlin Integration Core baseline, a
currency-aware order aggregate, HTTP ingestion and retrieval, and a PostgreSQL
schema managed with Flyway and accessed through a jOOQ repository adapter. The
repository persists complete orders and classifies equivalent and conflicting
replays using a versioned canonical payload fingerprint. New orders, timeline
events, and pending outbox events are committed atomically.

The current baseline establishes:

- a Java 21 compilation target;
- Kotlin and Quarkus LTS;
- a reproducible Maven Wrapper;
- automated formatting checks;
- GitHub Actions validation;
- order ingestion and retrieval HTTP endpoints with validation and Problem
  Details responses;
- generated and committed OpenAPI files;
- separate unit and integration-test execution with combined coverage reporting;
- PostgreSQL integration tests backed by Quarkus Dev Services;
- source-credential persistence and verification, with HTTP enforcement still
  pending.

HTTP authentication enforcement, outbox publishing, messaging, search, external
connectors, and user interfaces will be added as separate executable increments.

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
architecture and operational details. The current PostgreSQL structure is shown
in the [relational data model](docs/data-model.md). Significant design choices
are recorded in the [architecture decision log](docs/decisions/README.md).
