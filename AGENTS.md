# Repository Instructions

## Delivery approach

- Implement one acceptance-tested increment at a time.
- Keep the main branch buildable and accurately documented.
- Do not add infrastructure or abstractions for hypothetical future needs.
- Do not implement Kafka, OpenSearch, Node.js, React, authentication, or cloud
  deployment before the corresponding roadmap increment.

## Design priorities

Use this order when trade-offs are necessary:

1. Correctness
2. Readability
3. Maintainability
4. Reliability
5. Measured performance
6. Elegance

Prefer explicit domain names and straightforward control flow. Introduce an
interface only when it separates application logic from I/O or an external
dependency. Explain non-obvious invariants, security decisions, concurrency,
and failure behavior; do not narrate self-explanatory code.

## Language

Use English for source code, tests, comments, documentation, APIs, schemas, and
commit messages.

## Required checks

Run from `services/integration-core`:

```bash
./mvnw verify
```

Before committing, review the complete diff for secrets, proprietary data,
generated artifacts, and documentation that claims unimplemented behavior.
