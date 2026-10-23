# Alert runbook

One section per rule in
[`observability/prometheus/alerts.yml`](../../observability/prometheus/alerts.yml).
Each says what the alert means, how to confirm it, and what to do. The rules are
tested in `observability/prometheus/alerts.test.yml`; their thresholds are
demonstrative, because the Hub has no load test or production traffic to
calibrate them against.

In the local stacks no alert is delivered anywhere: Alertmanager
(`http://127.0.0.1:9093`) and the Prometheus alerts page show them. See
[`alertmanager.yml`](../../observability/alertmanager/alertmanager.yml) to add a
receiver.

Severity `page` means work has stopped or will be lost without a person;
`ticket` means a degradation to look at during working hours. While a service
cannot be scraped (`HubTargetDown`), its tickets are silenced and its pages are
not.

## HubTargetDown

**Means:** Prometheus has not scraped a Core or Gateway process for a minute.

**Check:** the process and its readiness: `docker compose ps`, or
`kubectl -n hub get pods` in the Kubernetes environment, then the process logs.
An unready pod is usually waiting for its database or broker.

**Do:** restore the process or what it depends on. Work is not lost while it is
down: providers retry webhooks, and pending deliveries and outbox events wait in
PostgreSQL.

## HubNoTargets

**Means:** Prometheus has no target at all for the Core or the Gateway: every
replica is gone (scaled to zero, deleted) or the target discovery is broken. In
the Kubernetes environment a pod that disappears leaves no `up` series, so
`HubTargetDown` cannot report it; this rule does.

**Check:** `kubectl -n hub get deployments,pods`, and the Prometheus
`/service-discovery` page if the pods exist.

**Do:** restore the Deployment. Nothing is lost meanwhile: providers retry
webhooks, and pending deliveries and outbox events wait in PostgreSQL.

## OutboxEventsWaitingTooLong

**Means:** the oldest Core outbox event has waited more than ten minutes to be
published, so orders stay `RECEIVED` or are not announced as `READY`.

**Check:** `integration_hub_outbox_backlog_events` and
`integration_hub_outbox_dispatch_events_total` by outcome. A growing backlog with
`published` still increasing is a burst the publisher cannot keep up with; no
`published` at all means publishing has stopped (Kafka unreachable, every Core
replica down, or every dispatch failing). The Core logs say which.

**Do:** restore Kafka or the Core replicas. For a burst, the outbox drains at
about five events a second per replica (`integration-hub.outbox.dispatch.*`):
wait, or add replicas. Nothing is lost while events wait.

## OutboxBacklogLarge

**Means:** more than a thousand outbox events have waited for fifteen minutes:
orders arrive faster than the outbox publishes them.

**Check:** the dispatch rate (`outcome="published"`) against the arrival rate of
orders.

**Do:** if it is sustained, raise the batch size, shorten the dispatch interval,
or add replicas. See ADR 0022 for the measured rate.

## OutboxEventsFailed

**Means:** outbox events reached a terminal failure after their bounded retries
(ADR 0006). They will not be published again on their own, so their orders are
stuck.

**Check:** the failed rows and their error code:
`select id, event_type, last_error_code, failed_at from outbox_events where status = 'FAILED'`.

**Do:** fix the cause named by the error code. Restoring the broker does not
republish terminal `FAILED` events, and there is no supported outbox replay
command yet; the rows remain available for diagnosis.

## OutboxBacklogUnknown

**Means:** the Core cannot read its outbox for the backlog metrics: the gauges
read NaN, so the outbox alerts above cannot fire.

**Check:** the Core logs for `Outbox backlog metrics could not be refreshed`, and
the database.

**Do:** restore the database connection. The gauges recover on the next refresh
(every 15 seconds).

## OutboxDispatchFailuresHigh

**Means:** more than one claimed outbox event in ten has been rescheduled or
failed for ten minutes: publishing to Kafka fails often.

**Check:** the Core logs for publication errors, and the broker's health.

**Do:** restore the broker. Rescheduled events are retried with backoff; watch
`OutboxEventsFailed` for those that run out of attempts.

## OutboxClaimsRecovered

**Means:** an outbox claim expired and was recovered: a Core replica stopped
while it held events, which were published late, after the two-minute claim
timeout (ADR 0005).

**Check:** Core restarts (`kubectl -n hub get pods`, restart counts and reasons).

**Do:** usually nothing for a single restart. Repeated recoveries mean a replica
keeps dying: find out why (memory limit, liveness probe, crashes).

## SearchProjectionLagging

**Means:** the latest order event reached the OpenSearch projection more than a
minute after it happened, for ten minutes.

**Check:** OpenSearch health and the projection consumer logs;
`GET /api/v1/operator/orders/search/status`.

**Do:** restore OpenSearch. PostgreSQL remains the authority and reconciliation
catches up (ADR 0015); search results are only late.

## GatewayDeliveryBacklogStale

**Means:** the oldest delivery eligible for forwarding has waited more than ten
minutes: webhooks are accepted but not reaching the Core.

**Check:** the delivery worker metrics and logs, the Core's health, and the
source credential (`INTEGRATION_CORE_SOURCE_API_KEY`).

**Do:** restore the Core or the worker. Deliveries are kept in PostgreSQL and
forwarded once it recovers.

## GatewayDeliveryWorkerStalled

**Means:** no delivery worker cycle has completed on any Gateway replica for
five minutes, although the worker has run before.

**Check:** the Gateway logs and `connector_gateway_delivery_worker_cycle_active`.
A cycle stuck on the database or on a slow Core shows as active without ending.

**Do:** restore the dependency; restart the Gateway if a cycle is stuck.

## GatewayPermanentDeliveryFailure

**Means:** the Core rejected deliveries in a way that retrying cannot fix
(ADR 0013), so they are terminal.

**Check:** `GET /api/v1/operator/deliveries?status=...` and each delivery's
attempts: the HTTP status and error code say why.

**Do:** fix the mapping or contract issue so future deliveries can succeed.
Existing `PERMANENT_FAILURE` deliveries remain terminal; there is no supported
replay command for that state. Operator replay is limited to eligible
`EXHAUSTED` deliveries; see
[Controlled operator replay](../gateway-delivery-lifecycle.md#controlled-operator-replay).

## GatewayDeliveryFailuresHigh

**Means:** more than one claimed delivery in five has failed and been scheduled
for retry, for ten minutes: the Core is slow, unavailable or rejecting requests.

**Check:** the Core's health and latency, and the attempts' HTTP statuses.

**Do:** restore the Core. Deliveries retry with bounded backoff (ADR 0014); watch
for permanent failures.

## GatewayDeliveryClaimsRecovered

**Means:** a delivery lease expired and was recovered: a Gateway replica stopped
while forwarding, and its deliveries were retried after the 60-second lease.

**Check:** Gateway restarts and their reasons.

**Do:** usually nothing for a single restart; repeated recoveries need a cause.

## ErpBPollingStale

**Means:** ERP_B has not been polled successfully for fifteen minutes, so its new
orders are not collected.

**Check:** `connector_gateway_erp_b_polling_runs_total` by outcome, the Gateway
logs, the ERP_B token and the provider's availability.

**Do:** restore access to ERP_B. Polling resumes from its last committed
checkpoint, so no order is skipped.
