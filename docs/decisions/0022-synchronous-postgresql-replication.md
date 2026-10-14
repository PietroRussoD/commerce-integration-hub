# ADR 0022: Synchronous PostgreSQL Replication in the Kubernetes Environment

- Status: Accepted
- Date: 2026-10-13

## Context

In the local Kubernetes environment (ADR 0021) each service has a CloudNativePG
cluster with a primary and a replica on different nodes. CloudNativePG
replicates asynchronously by default: the primary confirms a commit before the
replica has received it, so a failover can lose the most recent commits.

For the Hub such a loss is silent and permanent. The Gateway answers a provider
with `202` only after its own commit, and the provider does not send that event
again. The Core answers the Gateway with `201` after its commit, and the Gateway
then marks the delivery `DELIVERED` and stops retrying. A commit lost in a
failover is therefore an order that every party believes was handled.

Measurements on 2026-10-13, on the three-node kind cluster, with orders posted
one after another to the Core from a pod in the cluster
(`scripts/k8s/measure-ingestion.sh`):

| Replication | Added delay towards the replica | Accept latency p50 / p95 / p99 | Replica behind the primary |
| --- | --- | --- | --- |
| asynchronous | none | 2.5 / 4.0 / 5.2 ms | under 0.5 ms |
| synchronous (`ANY 1`) | none | 2.3 / 3.4 / 4.2 ms | under 0.5 ms (waited for) |
| asynchronous | 2 ms | 2.2 / 4.6 / 7.7 ms | 2 to 3 ms |
| synchronous (`ANY 1`) | 2 ms | 5.9 / 7.8 / 10.1 ms | 4 to 5 ms (waited for) |

On one machine the replica is so close that the choice makes no measurable
difference. With 2 ms of delay added on the path to the replica (`tc netem`,
roughly instances in different zones), the asynchronous window in which a
failover loses data grows to a few milliseconds, and synchronous replication
adds about 3.7 ms to each accepted order.

Availability when the replica is lost, measured by timing an `INSERT` on the
primary:

| Synchronous durability | Replica pod killed | Replica's node stopped |
| --- | --- | --- |
| `required` | write blocked about 3 s, until the pod restarted | **write blocked** for the whole 60 s limit; it would stay blocked until the node returns |
| `preferred` | not measured | write committed after about 41 s, once Kubernetes marked the node `NotReady` and replication was relaxed |

Failovers of the primary, with 60 webhooks in flight
(`scripts/k8s/verify-failures.sh core-primary|gateway-primary`), lost and
duplicated nothing in five runs with asynchronous replication; the promotion
took about 20 s on an idle machine. Five clean runs do not show that
asynchronous replication is safe: they show the window was small at that write
rate.

With synchronous `preferred` replication, the same two failovers also lost and
duplicated nothing, with the same 20 s promotion. A first synchronous run of the
Core failover did not settle within five minutes, but not because of
replication: the outbox was still draining about 3,200 events left by the
latency measurements, and the run's 60 orders all reached `READY`, once each,
when it had drained.

## Decision

Both clusters use synchronous replication with `method: any`, `number: 1` and
`dataDurability: preferred` (`deploy/data/postgres.yaml`):

- while the replica is healthy, a commit is confirmed only once the replica has
  it, so a failover does not lose an acknowledged order or delivery;
- when the replica's node is lost, writes stop for about 40 s and then continue
  asynchronously, instead of stopping until the node returns.

With two instances this is a compromise between the two failure modes; the
environment cannot afford a third instance per cluster on an 8 GB machine.

## Alternatives

- **Asynchronous (the default).** No latency cost, but a failover can silently
  lose acknowledged work.
- **Synchronous `required` with two instances.** No loss at all, but losing the
  replica's node stops every write until it returns: an outage of the
  database's availability for a failure of its replica.
- **Three instances, synchronous `required`, `ANY 1`.** The production shape:
  one replica can be lost without stopping writes or losing commits. Not used
  here only because of memory.

## Consequences

- An accepted order costs about one network round trip more, which is small
  for order ingestion.
- While a replica is unavailable the cluster runs asynchronously: a failure of
  the primary in that window can still lose data. This degraded state must be
  visible, and is a candidate alert (synchronous standby missing).
- Writes stop for about 40 s when the replica's node is lost. The services
  already retry: the provider resends webhooks and the Gateway retries the
  Core.
- A separate finding: the Core outbox publishes at most five events per second
  per replica (`dispatch.batch-size=5` every `1s`), about ten per second with
  two replicas, or about five orders per second through to `READY`. A burst
  above that is not lost but queues: 6,200 orders posted in seconds took about
  five minutes to drain. The outbox backlog gauges and the alerts
  `OutboxEventsWaitingTooLong` and `OutboxBacklogLarge` make that delay visible.
