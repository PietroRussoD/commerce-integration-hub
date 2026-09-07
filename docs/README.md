# Documentation

This directory documents what the repository implements, why it was built that
way, and where the implementation stops. Each document describes behavior that
exists; planned capabilities are marked as planned or recorded as decisions.

## Start here

- [Product and integration overview](product-overview.md): the problem, the
  actors, the end-to-end flow, the three integration modes, the reliability
  model, and a capability table separating implemented from planned work.
- [Current limitations](limitations.md): the precise boundary of the
  implementation. Read it before assuming any capability.

## How it works

Read in this order to follow one order through the system.

1. [Relational data model](data-model.md): the PostgreSQL schema owned by the
   Integration Core and the tables behind every later document.
2. [Ingestion sequences](ingestion-sequences.md): atomic first ingestion,
   equivalent replay, conflicting replay, and concurrent duplicates.
3. [Order lifecycle](order-lifecycle.md): the states an order moves through and
   the constraints that protect each transition.
4. [Outbox lifecycle](outbox-lifecycle.md): claim, publish, retry, expired-claim
   recovery, and terminal failure for the transactional outbox.
5. [Gateway delivery lifecycle](gateway-delivery-lifecycle.md): how the
   Connector Gateway takes durable receipt of a provider delivery and forwards
   it with bounded retries and fenced attempts.
6. [`ERP_B` polling](erp-b-polling.md): the pull integration mode, its cursor
   checkpoints, and its lease ownership.
7. [Flow Explorer](flow-explorer.md): how captured local scenarios are
   sanitized and replayed in the Operator Console.

## Frontend

- [Accessibility plan](accessibility.md): the target, what is automatically
  verified, and what remains a manual audit.

## Decisions and releases

- [Architecture decision log](decisions/README.md): the significant choices,
  each with the alternatives that were rejected and why.
- [Release process](releases/README.md): the versioning policy, the steps that
  produce a release, and the notes for every published milestone.
