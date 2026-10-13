# Local Kubernetes environment

An optional environment that runs the Hub on a local Kubernetes cluster, to
exercise it under conditions Docker Compose cannot reproduce: replicas on
different nodes, database failover, and (in later increments) a service mesh and
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

There is no waypoint, so the mesh works at layer 4 and cannot retry HTTP
requests: retries stay in the applications
([ADR 0023](../docs/decisions/0023-ambient-mesh-and-application-retries.md)).

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
that the ingress does not expose health or metrics. `mesh.sh remove` takes it
all away.

## Observability

`scripts/k8s/observability.sh` installs the stack with the configuration files of
[`observability/`](../observability/README.md): the alert rules
(`prometheus/alerts.yml`), `alertmanager.yml`, the Collector and the Grafana
provisioning, loaded into ConfigMaps, so Compose and the cluster share them.
`observability.sh remove` takes it away and turns tracing off. `HUB_GRAFANA=false`
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
provider would. While they are sent, it kills one Core pod and one Gateway pod
(`pods`), or the primary of one PostgreSQL cluster (`core-primary`,
`gateway-primary`). It then checks both databases: every webhook accepted, one
delivery and one order per webhook, every delivery `DELIVERED` and every order
`READY`, each order's three status transitions exactly once, each
`OrderReceived` and `OrderReady` event written and published once, each
`OrderReceived` event recorded once by the order processor, and no delivered
order missing from the Core.

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
