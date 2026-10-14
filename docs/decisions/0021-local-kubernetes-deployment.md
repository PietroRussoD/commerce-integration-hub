# ADR 0021: Local Kubernetes Deployment

- Status: Accepted
- Date: 2026-10-12

## Context

Docker Compose is the reproducible local demonstration, and
`docs/limitations.md` states that it is not a production topology. The value of
the Hub lies in its durable handoffs (the Gateway delivery ledger, the Core
outboxes and inbox) surviving restarts, retries, and failures. Compose can
restart a container, but it cannot fail over a database, spread replicas across
nodes, or inject network faults between two services.

This decision concerns an optional local Kubernetes environment that runs the
same applications under those conditions. It does not introduce a cloud
deployment, a public endpoint, or production claims.

A spike on 2026-10-12 ran the stack on a three-node kind cluster (Kubernetes
1.37.0, arm64, Docker Desktop with 8 GB of memory):

- Istio 1.31.1 in ambient mode, with Gateway API CRDs v1.6.3. Every application
  pod was enrolled in the mesh and reached through HBONE (mTLS via ztunnel).
- CloudNativePG 1.30.1 (chart 0.29.1) with two PostgreSQL 18.6 clusters, `core`
  and `gateway`, each with a primary and a replica on different nodes.
- The Redpanda operator v26.2.4 with one Redpanda v26.2.1 broker; the four
  Kafka topics were declared as `Topic` resources instead of the
  `redpanda-init` script.
- Integration Core and Connector Gateway, two replicas each, built locally for
  arm64 and loaded into the nodes. The Core became ready against PostgreSQL and
  Redpanda; the Gateway migration ran as a Job before the Gateway started.
  Each replica took its worker ID from its pod name.
- A namespace waypoint. A test server that always answers `503` received
  exactly one request per client call, for both `GET` and `POST`: the waypoint
  did not retry upstream `503` responses by default. A `VirtualService` on the
  waypoint injected a fixed 2 s delay on every request and a `503` on half of
  them (5 of 10); removing it restored normal responses.
- Memory at rest, measured with `docker stats` and `kubectl top`: about 1.7 GB
  for the empty cluster, about 4.9 GB with the data services, mesh and
  applications, and about 0.5 GB more for the OpenTelemetry Collector, Jaeger,
  Prometheus, and Grafana (Grafana alone about 370 MB). The Kubernetes API
  server was the largest single process (about 930 MB).

The spike did not send an order through the system: with its delivery worker
enabled, the Gateway requires a Core source API key, which must be provisioned
first. It did not measure memory under load or exercise a database failover.

## Decision

Add an optional local Kubernetes environment alongside Compose:

- kind with one control-plane node and two workers;
- one Helm chart for the applications, with startup, readiness, and liveness
  probes, resource requests and limits, worker IDs from pod names, and
  migrations as Jobs;
- CloudNativePG for PostgreSQL and the Redpanda operator for Kafka, with topics
  declared as resources;
- Istio ambient with Gateway API for ingress, mTLS between application
  services, and a waypoint only where layer-7 behavior is needed;
- application-level retries only. The Gateway already bounds and classifies
  its retries (ADR 0013, ADR 0014); mesh retries must stay disabled for calls
  from the Gateway to the Core.

The cluster uses its own kubeconfig file, never the user's default one, and
the scripts that operate on it must refuse to run against any other context.

Compose remains the simplest way to run and test the project.

## Alternatives

- **Compose only.** Simpler, but it cannot demonstrate failover, replica
  placement, or network faults.
- **k3d or minikube.** Both would work; kind is the environment used by the
  Istio documentation and by many CNCF projects.
- **Istio sidecars.** More memory per pod and more moving parts than ambient
  mode for the same mTLS and fault-injection needs.
- **Linkerd.** A valid mesh, but Istio and Gateway API are the more widely
  asked-for combination.
- **Hand-written StatefulSets for PostgreSQL.** They would not show failover or
  backups.
- **Strimzi with Apache Kafka.** Mature, but it would change the broker the
  existing tests run against.

## Consequences

- The project gains a second runtime to keep working, with its own scripts,
  chart, and documentation.
- The full stack, with the mesh and the observability stack, uses about 5.4 GB
  of the 8 GB given to Docker, leaving about 2 GB; load, OpenSearch, and later
  additions such as Argo CD may require 10 to 12 GB.
- Images must be available for arm64. The published GHCR images are
  `linux/amd64` only, so local builds are loaded into kind until the release
  workflow builds both platforms.
- The Gateway's source API key must be provisioned in the cluster before its
  delivery worker can run.
- The chart, the probes, a two-replica test, database failover, and the failure
  scenarios were verified in the real applications on 2026-10-13; the decisions
  that followed are recorded in ADR 0022 (replication) and ADR 0023 (the service
  mesh).
