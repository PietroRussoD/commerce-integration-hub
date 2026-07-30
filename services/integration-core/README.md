# Integration Core

The Integration Core will own the canonical order model and reliable ingestion
workflow.

The current increment contains build configuration only. It deliberately has no
HTTP endpoints, database schema, or messaging components.

## Prerequisites

- Java 21 or newer

## Build

```bash
./mvnw verify
```

## Format

```bash
./mvnw spotless:apply
```
