# ADR 0023: Ambient Service Mesh, Identity-Based Authorization, and Application Retries

- Status: Accepted
- Date: 2026-10-13

## Context

In the local Kubernetes environment (ADR 0021) any pod could reach the Core, the
Gateway and the simulator in clear text: the cluster network decided nothing.
The services authenticate their callers in the application (source API keys,
ADR 0001; operator JWTs, ADR 0019), but nothing says which workloads may open a
connection to which, and nothing encrypts the traffic between them.

The Hub also depends on retries being made in exactly one place. The Gateway
retries deliveries with bounded, classified backoff (ADR 0013, ADR 0014); the
Core retries outbox publication (ADR 0006). A mesh that retried HTTP requests
on its own would multiply those attempts and turn one failing order into a
burst against a struggling service.

Verified on 2026-10-13 with Istio 1.31.1 in ambient mode and Gateway API v1.6.3
(`scripts/k8s/mesh.sh`, `scripts/k8s/verify-mesh.sh`):

- every application and observability pod speaks HBONE (mutual TLS through
  ztunnel); Kubernetes probes keep working with mutual TLS required, and the
  Gateway migration Job runs without a sidecar to stop;
- a pod outside the mesh cannot reach the Core; a pod inside the mesh with an
  identity no policy allows cannot reach the Core, the Gateway or the simulator;
  the allowed identities get through;
- Prometheus, inside the mesh, still scrapes every replica;
- the ingress routes the APIs and answers `404` for `/health/*` and `/metrics`;
- the smoke test passes through the ingress, the pod failure test
  (`verify-failures.sh pods`) loses and duplicates nothing, and every trace with
  a Gateway delivery still contains the Core's spans;
- accepting an order, with tracing on, went from 4.8 / 9.2 / 13.4 ms (p50 / p95
  / p99) without the mesh to 6.0 / 14.4 / 25.4 ms with it, in one measurement
  each on one machine;
- the mesh components take about 190 MB (istiod, three ztunnels and CNI agents,
  the ingress proxy).

Retries were measured on 2026-10-13 with a stand-in server behind the Core's
waypoint that counts the requests it receives. With no explicit retry policy, one
call that failed with a `503`, and one whose connection was dropped without an
answer, each reached the server once: the waypoint did not retry either. A retry
on a connection that cannot be established at all was not provoked, so whether
the waypoint's defaults would retry that is not known here. That default also
belongs to the Istio version, so the guarantee below does not rest on it.
Without a waypoint the mesh has no layer-7 proxy in the path at all, and so
nothing to retry with.

## Decision

- **Istio in ambient mode** for the `hub` and `observability` namespaces. The
  `hub-data` namespace (PostgreSQL, Redpanda) stays outside: the operators
  manage those connections, and CloudNativePG can require TLS of its own.
- **Strict mutual TLS** in `hub` (`PeerAuthentication` `STRICT`).
- **Authorization by workload identity**, enforced by ztunnel at layer 4
  (`deploy/mesh/authorization.yaml`): nothing is allowed by default
  (`allow-nothing`); the Core accepts the Gateway, the ingress, Prometheus and
  the test identity on its port; the Gateway accepts the ingress, Prometheus and
  the test identity; the simulator accepts only the Gateway. Each application
  has its own service account for this.
- **A Gateway API ingress** (`deploy/mesh/ingress.yaml`) that routes only
  `/providers/`, `/api/v1/operator/deliveries` and `/api/v1/`.
- **One waypoint, in front of the Core only**, for the Core's caller policy and
  for fault injection in the failure tests. The mesh does not retry: the
  waypoint carries an **explicit no-retry policy** (`attempts: 0`) for calls to
  the Core, verified by `scripts/k8s/verify-mesh.sh`, so the rule does not depend
  on a default. **Retries stay in the applications.** Because ztunnel then sees
  the waypoint as the caller, the Core's pods admit the waypoint, the ingress and
  Prometheus, and the callers allowed to reach the Core are named on the waypoint
  (`integration-core-callers`).
- A **test identity**, `hub-test-client`, for the pods of the verification
  scripts, allowed explicitly and named as such.

## Alternatives

- **Sidecars.** The same guarantees with a proxy in every pod: more memory, a
  restart to join the mesh, and, without native sidecars, Jobs that need their
  sidecar stopped.
- **Kubernetes NetworkPolicies.** They restrict by pod labels and IPs, not by
  cryptographic identity, and do not encrypt; they would be a sensible extra
  layer, not a replacement.
- **A waypoint for every service.** It gives layer-7 policies and metrics, but
  puts a proxy in front of every call and changes who each destination sees as
  the caller. One for the Core is enough for what is needed here.
- **Linkerd.** A valid mesh; Istio with Gateway API is the more common
  combination.

## Consequences

- A caller has to be named in a policy to reach a service. Adding a new client
  is a change to `deploy/mesh/authorization.yaml`.
- Layer-4 policies name a port, not a path: Prometheus may call any endpoint of
  the Core's port, not only `/metrics`. A separate management port for metrics
  and health (Quarkus supports one) would let the policy tell them apart.
- Traffic to PostgreSQL and Redpanda leaves the mesh and is not encrypted by it.
- The mesh adds about a millisecond at the median and a few at the tail to an
  order's acceptance, on this machine.
- The ingress reaches the Core's pods directly, not through the waypoint, so its
  calls are subject to the pods' policy, not to the waypoint's; Prometheus
  likewise.
- The failure scenarios that inject faults at the waypoint (`core-slow`,
  `core-errors`, `gateway-lease`) were run through it and passed on 2026-10-13.
