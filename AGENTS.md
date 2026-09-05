# Repository Instructions

## Delivery approach

- Implement one acceptance-tested increment at a time.
- Keep the main branch buildable and accurately documented.
- Do not add infrastructure or abstractions for hypothetical future needs.
- Do not implement a capability before its roadmap increment. The
  [capability status](docs/product-overview.md#capability-status) table records
  what is implemented and what is still planned.

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

Run from `apps/operator-console`:

```bash
pnpm check:api
pnpm check
```

Run from `services/connector-gateway`:

```bash
pnpm check
pnpm test:integration
```

Run from `tools/provider-simulator`:

```bash
pnpm check
```

Run from the repository root:

```bash
./scripts/check-module-versions.sh
```

Before committing, review the complete diff for secrets, proprietary data,
generated artifacts, and documentation that claims unimplemented behavior.

## Releases

Every module carries the same repository version. The
[release process](docs/releases/README.md) documents that policy and the steps
that produce a release.
