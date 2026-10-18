# Local Kubernetes environment

An optional environment that runs the Hub on a local Kubernetes cluster, to
exercise it under conditions Docker Compose cannot reproduce: replicas on
different nodes, database failover, a service mesh and
injected network faults. Compose remains the simplest way to run the project.

This is a local demonstration. It has no cloud deployment, no public endpoint,
and makes no production claim; see [ADR 0021](../docs/decisions/0021-local-kubernetes-deployment.md)
and [Limitations](../docs/limitations.md).

## What it runs

| Component | How |
| --- | --- |
| Cluster | kind, one control-plane node and two workers (`deploy/kind/cluster.yaml`) |
| PostgreSQL | CloudNativePG, two clusters (`core`, `gateway`), a primary and a replica each, on different nodes |
| Kafka | Redpanda operator, one broker; the four topics are `Topic` resources |
| Applications | the Helm chart `deploy/charts/commerce-integration-hub`: Integration Core and Connector Gateway with two replicas each, the provider simulator, and the Gateway migration as a Job |
| Service mesh (optional) | `mesh.sh` installs Istio in ambient mode for `hub` and `observability`, strict mutual TLS, authorization by workload identity, and a Gateway API ingress |
| Observability (optional) | `observability.sh` installs Prometheus with the alert rules, Alertmanager, the OpenTelemetry Collector, Jaeger and Grafana in the `observability` namespace, and turns tracing on in the Core and the Gateway |

OpenSearch and the operator console are not part of this environment.

## Requirements

- Docker Desktop with at least 8 GB of memory (the stack uses about 5 GB at rest).
- `kind`, `kubectl`, `helm`, a JDK 25, and `python3` and `curl`.
- Versions are pinned in [`versions.env`](versions.env).

## Use

```bash
scripts/k8s/up.sh              # create the cluster and install everything
scripts/k8s/provision-source.sh  # create the MARKETPLACE_A credential, turn on the Gateway worker
scripts/k8s/smoke.sh           # one signed webhook, followed until the order is READY
scripts/k8s/verify-failures.sh pods            # 60 webhooks while a Core pod and a Gateway pod are killed
scripts/k8s/verify-failures.sh core-primary    # ... while the Core's PostgreSQL primary is killed
scripts/k8s/verify-failures.sh gateway-primary # ... while the Gateway's PostgreSQL primary is killed
scripts/k8s/verify-failures.sh core-slow       # ... while every call to the Core takes 3 s longer (mesh)
scripts/k8s/verify-failures.sh core-errors     # ... while the Core refuses every call for 20 s (mesh)
scripts/k8s/verify-failures.sh gateway-lease   # ... a Gateway pod killed with deliveries in flight (mesh)
scripts/k8s/verify-failures.sh core-db-blackhole # ... while all traffic to the Core's database primary is dropped for 40 s
scripts/k8s/verify-failures.sh broker          # ... while the Redpanda broker is killed
scripts/k8s/verify-failures.sh node            # ... while the node with the Core's primary stops for a minute
scripts/k8s/measure-ingestion.sh 1000          # accept latency of 1000 orders and replica lag
scripts/k8s/observability.sh                   # Prometheus, Alertmanager, Jaeger, Grafana; turns tracing on
scripts/k8s/verify-alerts.sh                   # cause two failures and check the alerts reach Alertmanager
scripts/k8s/mesh.sh                            # Istio ambient, strict mTLS, authorization, Gateway API ingress
scripts/k8s/verify-mesh.sh                     # who gets through the mesh, and who is refused
scripts/k8s/down.sh            # delete the cluster
```

`up.sh` builds the three images for the machine's own architecture and loads
them into the nodes; the published images are `linux/amd64` only. It is safe to
run again, and `HUB_SKIP_BUILD=true` reuses the images already built.

To look at the cluster, use the environment's own kubeconfig:

```bash
export KUBECONFIG="$HOME/.kube/hub-local.yaml"
kubectl -n hub get pods
```

## Service mesh

`scripts/k8s/mesh.sh` installs Istio (pinned in `versions.env`) in ambient mode
and puts the `hub` and `observability` namespaces in the mesh; `hub-data` stays
out. In `hub` every connection must be mutual TLS, and
[`deploy/mesh/authorization.yaml`](mesh/authorization.yaml) says who may call
whom, by service account: nothing is allowed by default, the Core accepts the
Gateway, the ingress, Prometheus and the test identity, the Gateway accepts the
ingress, Prometheus and the test identity, and the simulator accepts only the
Gateway. The pods of the verification scripts run as `hub-test-client`.

One waypoint, `core-waypoint`, stands in front of the Core only. It carries the
caller policy for the Core (`integration-core-callers`: the Gateway and the test
identity), an **explicit no-retry policy** (`attempts: 0`), and is where network
faults are injected for the failure tests. The Core's pods admit the waypoint,
the ingress and Prometheus, so nobody can bypass the waypoint by calling a pod.
The mesh never retries a call: retries stay in the applications
([ADR 0023](../docs/decisions/0023-ambient-mesh-and-application-retries.md)).
`verify-mesh.sh` checks that, with the policy, a call answered 503 and a call
whose connection is dropped each reach a stand-in server once.

With the mesh installed the APIs are reached through the ingress, which routes
`/providers/`, `/api/v1/operator/deliveries` and `/api/v1/` and nothing else:

```bash
export KUBECONFIG="$HOME/.kube/hub-local.yaml"
kubectl -n hub-ingress port-forward svc/hub-ingress-istio 8080:80
```

`smoke.sh` uses the ingress by itself when the mesh is installed.
`verify-mesh.sh` checks that every pod speaks mutual TLS, that a pod outside the
mesh and a meshed pod with an identity nobody allowed are both refused, that the
allowed callers get through, that Prometheus still scrapes every replica, and
that the ingress does not expose health or metrics. The checks that involve
Prometheus run only when the observability stack is installed. `mesh.sh remove`
takes it all away.

## Observability

`scripts/k8s/observability.sh` installs the stack with the configuration files of
[`observability/`](../observability/README.md): the alert rules
(`prometheus/alerts.yml`), `alertmanager.yml`, the Collector and the Grafana
provisioning, loaded into ConfigMaps, so Compose and the cluster share them.
`observability.sh remove` takes it away and turns tracing off. With the mesh
installed, it puts the `observability` namespace in the mesh first, so that
Prometheus can still scrape the applications; either order of the two scripts
works. `HUB_GRAFANA=false`
leaves Grafana out, the heaviest piece (about 370 MB).

Prometheus finds the application pods itself, so every replica is a target of its
own: a Service would send each scrape to a different replica and interleave
their counters. Its only permission is to read the pods of the `hub` namespace.
The application pods being the targets means a pod that disappears leaves no
`up` series, so `HubTargetDown` cannot see it; `HubNoTargets` covers the case
where no replica of an application exists.

To open the interfaces from this machine, forward a port of the environment's own
kubeconfig:

```bash
export KUBECONFIG="$HOME/.kube/hub-local.yaml"
kubectl -n observability port-forward svc/prometheus   9090:9090   # alerts and targets
kubectl -n observability port-forward svc/alertmanager 9093:9093
kubectl -n observability port-forward svc/jaeger       16686:16686 # traces
kubectl -n observability port-forward svc/grafana      3000:3000
```

A trace of one order runs through the Gateway's webhook receipt, the Core's
`POST /api/v1/orders`, the outbox, and the Kafka publish and receive up to
`OrderReady`. Alertmanager shows the alerts and sends them nowhere.

`scripts/k8s/verify-alerts.sh` scales the Core to zero and rolls out a Gateway
image that does not exist, checks that `HubNoTargets` and `HubTargetDown` reach
Alertmanager, and undoes both.

## Failures in the middle of the flow

`verify-failures.sh` sends 60 signed webhooks from a pod inside the cluster,
retrying a failed request with the same bytes for up to three minutes, as a
provider would. While they are sent, something fails: pods are killed (`pods`),
a PostgreSQL primary is killed (`core-primary`, `gateway-primary`), the Core is
made slow or refuses calls at its waypoint (`core-slow`, `core-errors`), a
Gateway pod is killed while the Core is slow so that its leases must be recovered
(`gateway-lease`), the broker is killed (`broker`), or the node with the Core's
primary stops (`node`). The scenarios that inject a fault check that it took
effect, from the attempts the Gateway recorded. The script then checks both
databases: every webhook accepted, one
delivery and one order per webhook, every delivery `DELIVERED` and every order
`READY`, each order's three status transitions exactly once, each
`OrderReceived` and `OrderReady` event written and published once, each
`OrderReceived` event recorded once by the order processor, and no delivered
order missing from the Core.

The Core's JDBC connections have a connect timeout of 5 s and a socket timeout of
30 s (`DB_CONNECT_TIMEOUT_SECONDS`, `DB_SOCKET_TIMEOUT_SECONDS`). Without them,
a database that stops answering without closing its connections, as a lost node
does, left the Core's worker threads blocked for ever until the pods were
restarted: `core-db-blackhole` leaves 51 of 60 orders unaccepted after four
minutes without the timeouts, and settles them in under two minutes with them.

Replication between the PostgreSQL instances is synchronous (`preferred`), so a
failover does not lose a commit the services have already acknowledged; the last
check would catch it if it did. See
[ADR 0022](../docs/decisions/0022-synchronous-postgresql-replication.md) for the
measured trade-offs.

`measure-ingestion.sh [orders]` posts orders straight to the Core from a pod in
the cluster and reports the accept latency and the replica's lag.

The Core outbox publishes about ten events per second with two replicas (five
per replica: `dispatch.batch-size=5` every second). A burst above that queues
in the outbox: run the failure tests only after it has drained, or they will
time out waiting for orders that are merely late.

Settling can take a few minutes: an outbox claim held by a killed Core pod is
recovered after its two-minute claim timeout, and a delivery lease held by a
killed Gateway pod after 60 seconds.

## Your own kubeconfig is never touched

The scripts use `~/.kube/hub-local.yaml` (override with `HUB_KUBECONFIG`) and
never read or write `~/.kube/config`. Every cluster command goes through
`scripts/k8s/lib.sh`, which refuses to run unless that kubeconfig has the
context `kind-hub` and the context's API server is on the local machine. Helm
keeps its repositories and caches in `~/.cache/commerce-integration-hub/helm`
(`HUB_HELM_HOME`), not in your Helm folders.

## Design notes

- **Worker IDs.** Each replica names its outbox, delivery, polling and
  reconciliation workers after its own pod, so a claim or lease in PostgreSQL
  says which replica holds it.
- **Probes.** Startup and readiness use `/health/ready`; liveness uses
  `/health/live`, which does not look at the database. A database outage makes
  pods unready instead of restarting them.
- **Migrations.** The Gateway schema is migrated by a Helm hook Job before each
  install and upgrade. The Core migrates with Flyway at startup, which takes a
  database lock and is safe with two replicas starting together.
- **Credentials.** The database credentials are created by CloudNativePG in the
  `hub-data` namespace and copied into `hub` by `up.sh`. The peppers, webhook
  secret and ERP_B token are the same synthetic values as `compose.yaml`
  (`values.yaml`), valid only for this local stack. The source API key is
  created by the Core's own administrative command and kept only in the Secret
  `gateway-source-key`.
- **Security settings.** Containers run as non-root with a read-only root
  filesystem, no added capabilities, and the runtime default seccomp profile.

## Operator API profiles

The chart defaults to the local demo profile: Core and Gateway operator API
authorization is disabled, matching the Compose demo. The repository does not
include an identity provider or token issuer, so treat this profile as a local
demonstration configuration.

To use an external OIDC issuer, set one `operatorSecurity` block in a Helm
values file and enable both services together:

```yaml
operatorSecurity:
  enabled: true
  issuer: https://idp.example.com/realms/integration-hub
  audience: integration-hub-operator-api
  coreAuthServerUrl: https://idp.example.com/realms/integration-hub
  gatewayJwksUrl: https://idp.example.com/realms/integration-hub/protocol/openid-connect/certs
  clockSkewSeconds: 30
```

Replace the example URLs with the issuer's exact issuer, discovery/auth-server,
and JWKS endpoints. Helm rejects an enabled profile with missing settings,
invalid URLs, an out-of-range clock skew, or a `.invalid` placeholder. Both
services must be able to reach their configured issuer endpoints. Use HTTPS for
an external issuer; HTTP is useful only for an isolated local fixture.

The chart passes the same issuer and audience to Core and Gateway. Their role
policies read the `groups` claim and require `operator` for reads and
`platform-admin` for Gateway replay. Obtain tokens from the external identity
provider and enter them in the Console's in-memory token control. The chart
creates no issuer, client secret, signing key, users, roles, or login flow. It
does not change the separate controls on health, readiness, metrics, provider
routes, or source API keys.
