# Failure runbook

What each failure does to the Hub in the local Kubernetes environment, what to
look at, and what to do. Every scenario below is a script:
`scripts/k8s/verify-failures.sh <scenario>` sends 60 signed webhooks from a pod
inside the cluster while the failure happens, then checks both databases for one
delivery and one order per webhook, every order `READY`, each status transition
and each event exactly once, and no delivered order missing from the Core.

The scenarios are checks of this environment on one machine, not a
guarantee of production behavior. Run them with heavy programs closed and with the
outbox empty: a loaded machine fails liveness probes, and a backlog makes orders
late rather than lost.

## What survives what

The Hub keeps work in PostgreSQL until the next step has taken it: the Gateway's
delivery ledger, the Core's orders, its outbox and its inbox. A failure therefore
delays work, and a retry or a recovery finishes it. Three rules make that safe to
repeat: the Gateway answers a provider `202` only after its own commit, and
equivalent replays return the same delivery; the Core ingests an order once per
source and external ID; and a Kafka event is recorded in the inbox before it is
processed.

## Scenarios

| Scenario | What fails | What you see | Recovery |
| --- | --- | --- | --- |
| `pods` | one Core pod and one Gateway pod, killed without a grace period | requests fail over to the other replica; an outbox claim held by the dead Core is published after its two-minute claim timeout | automatic |
| `core-primary`, `gateway-primary` | the primary of a PostgreSQL cluster | writes fail for about 20 s until the replica is promoted; the Gateway retries deliveries and the provider retries webhooks | automatic (CloudNativePG) |
| `core-slow` | every call to the Core takes 3 s longer (at the waypoint) | deliveries take longer; nothing fails while the delay stays under the Gateway's 5 s timeout | automatic when the delay ends |
| `core-errors` | the Core refuses every call with `503` for 20 s | deliveries fail and are retried with 5 s, 30 s and longer pauses; about two thirds of them needed a retry | automatic; a delivery that exhausts its five attempts needs a replay |
| `gateway-lease` | a Gateway pod killed while the Core is slow | the deliveries it had claimed (one batch, five in the test) are held for 60 s, then another replica retries them; the Core takes each order once | automatic after the lease expires; `GatewayDeliveryClaimsRecovered` is raised |
| `core-db-blackhole` | all traffic to the Core's database primary is dropped for 40 s, no connection closed | calls that need the database hang for up to 30 s, then fail; deliveries are retried; no pod restarted in the final run | automatic with the JDBC timeouts, in about two minutes; see below |
| `broker` | the Redpanda broker | the outbox cannot publish; events are rescheduled with backoff; consumers wait | automatic after the broker returns |
| `node` | a worker node stops for a minute | whatever ran on it stops, possibly the database primary and the broker | automatic; slow, about thirteen minutes in the run that found the timeout defect |

Replication is synchronous in `preferred` mode
([ADR 0022](../decisions/0022-synchronous-postgresql-replication.md)): a failover
does not lose a commit the services acknowledged, and if the replica's node is
lost, writes pause for about 40 s and then continue asynchronously.

## When something does not recover

**Orders stay `RECEIVED` and their events are published.** A Core consumer is
stuck. Its threads are most likely waiting on a database connection that
stopped answering without closing, which is what the Core's JDBC connect and
socket timeouts (`DB_CONNECT_TIMEOUT_SECONDS`, default 5, and
`DB_SOCKET_TIMEOUT_SECONDS`, default 30) exist to prevent. Check the consumer lag
(`rpk group describe integration-core-order-processor` in the Redpanda pod); a
lag that does not fall while the group is `Stable` confirms it. Restarting the
Core pods clears it. Before the timeouts, a lost database node left orders in this
state for more than thirteen minutes, until the Core was restarted.

**Orders stay `RECEIVED` and the outbox is full.** Publishing is slow or stopped.
The alerts `OutboxEventsWaitingTooLong` and `OutboxBacklogLarge` say so; see the
[alert runbook](alerts.md). The outbox publishes about ten events a second with
two replicas, so a burst queues rather than being lost.

**A Gateway delivery is `EXHAUSTED`.** It failed five times. Fix the cause, then
replay it with the operator replay command
([Gateway delivery lifecycle](../gateway-delivery-lifecycle.md)).

**A Core pod crash-loops on start while the database changes primary.** It
retries until the database settles; the pod comes back by itself.

## Not covered

The Connector Gateway's own database calls have no explicit timeouts. In the
scenarios the Gateway did not stall, but the Core's defect shows that a client
without them can. The scenarios do not cover OpenSearch, sustained load, or
more than one failure at a time.
