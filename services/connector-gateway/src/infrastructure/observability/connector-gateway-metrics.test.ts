import { describe, expect, it, vi } from "vitest";

import { createConnectorGatewayMetrics } from "./connector-gateway-metrics.js";
import type { RunErpBPollingResult } from "../../application/polling/run-erp-b-polling.js";

const CYCLE_RESULT = {
    processing: {
        blockedConfigurations: 1,
        claimed: 5,
        delivered: 1,
        permanentFailures: 1,
        retryableFailures: 1,
        staleClaims: 1
    },
    recovery: {
        found: 3,
        recovered: 2,
        staleClaims: 1
    }
};
const EMPTY_OPERATIONAL_SNAPSHOT = {
    activeConnectors: 2,
    blockedConnectors: 0,
    disabledConnectors: 0,
    eligibleDeliveries: 0,
    lastSuccessfulPollAt: null,
    oldestEligibleReceivedAt: null
};

describe("createConnectorGatewayMetrics", () => {
    it("exports payload retention totals with fixed outcome labels", async () => {
        const metrics = createConnectorGatewayMetrics();
        metrics.payloadRetention.recordCompleted(3);
        metrics.payloadRetention.recordCompleted(0);
        metrics.payloadRetention.recordFailed();
        const exposition = await metrics.exporter.metrics();
        expect(exposition).toContain('connector_gateway_payload_retention_batches_total{outcome="completed"} 2');
        expect(exposition).toContain('connector_gateway_payload_retention_batches_total{outcome="failed"} 1');
        expect(exposition).toContain("connector_gateway_payload_retention_cleared_deliveries_total 3");
    });

    it.each([-1, NaN, 1.5])("rejects invalid cleared count %s before changing metrics", async cleared => {
        const metrics = createConnectorGatewayMetrics();
        expect(() => metrics.payloadRetention.recordCompleted(cleared)).toThrow("cleared must be a nonnegative safe integer");
        expect(await metrics.exporter.metrics()).toContain("connector_gateway_payload_retention_cleared_deliveries_total 0");
    });
    it("collects the current durable delivery backlog", async () => {
        const readOperationalSnapshot = vi.fn().mockResolvedValue({
            ...EMPTY_OPERATIONAL_SNAPSHOT,
            activeConnectors: 1,
            blockedConnectors: 1,
            eligibleDeliveries: 2,
            lastSuccessfulPollAt: new Date("2026-08-30T08:58:00.000Z"),
            oldestEligibleReceivedAt: new Date("2026-08-30T08:59:00.000Z")
        });
        const metrics = createConnectorGatewayMetrics({
            currentTimeMilliseconds: () => Date.parse("2026-08-30T09:00:00.000Z"),
            operationalMetricsSource: { readOperationalSnapshot }
        });

        const exposition = await metrics.exporter.metrics();

        expect(readOperationalSnapshot).toHaveBeenCalledWith(
            new Date("2026-08-30T09:00:00.000Z")
        );
        expect(exposition).toContain("connector_gateway_delivery_backlog 2");
        expect(exposition).toContain(
            "connector_gateway_delivery_backlog_oldest_age_seconds 60"
        );
        expect(exposition).toContain(
            'connector_gateway_connector_configurations{status="active"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_connector_configurations{status="blocked_configuration"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_connector_configurations{status="disabled"} 0'
        );
        expect(exposition).toContain(
            "connector_gateway_erp_b_polling_last_successful_unixtime 1788080280"
        );
        expect(exposition).toContain(
            "connector_gateway_erp_b_polling_checkpoint_age_seconds 120"
        );
    });

    it.each([
        [null, 0],
        [new Date("2026-08-30T09:01:00.000Z"), 1]
    ] as const)("reports zero backlog age for oldest value %s", async (oldest, count) => {
        const metrics = createConnectorGatewayMetrics({
            currentTimeMilliseconds: () => Date.parse("2026-08-30T09:00:00.000Z"),
            operationalMetricsSource: {
                readOperationalSnapshot: () =>
                    Promise.resolve({
                        ...EMPTY_OPERATIONAL_SNAPSHOT,
                        eligibleDeliveries: count,
                        lastSuccessfulPollAt: oldest,
                        oldestEligibleReceivedAt: oldest
                    })
            }
        });

        const exposition = await metrics.exporter.metrics();
        expect(exposition).toContain(
            "connector_gateway_delivery_backlog_oldest_age_seconds 0"
        );
        expect(exposition).toContain(
            "connector_gateway_erp_b_polling_checkpoint_age_seconds 0"
        );
    });

    it.each([
        [{ ...EMPTY_OPERATIONAL_SNAPSHOT, activeConnectors: -1 }, "activeConnectors"],
        [{ ...EMPTY_OPERATIONAL_SNAPSHOT, blockedConnectors: 1.5 }, "blockedConnectors"],
        [
            { ...EMPTY_OPERATIONAL_SNAPSHOT, lastSuccessfulPollAt: new Date(Number.NaN) },
            "lastSuccessfulPollAt"
        ],
        [
            {
                ...EMPTY_OPERATIONAL_SNAPSHOT,
                eligibleDeliveries: 1,
                oldestEligibleReceivedAt: new Date(Number.NaN)
            },
            "oldestEligibleReceivedAt"
        ],
        [
            {
                ...EMPTY_OPERATIONAL_SNAPSHOT,
                eligibleDeliveries: 0,
                oldestEligibleReceivedAt: new Date("2026-08-30T08:59:00.000Z")
            },
            "an empty backlog"
        ],
        [
            { ...EMPTY_OPERATIONAL_SNAPSHOT, eligibleDeliveries: 1 },
            "a non-empty backlog"
        ]
    ] as const)("rejects an invalid backlog snapshot: %s", async (snapshot, message) => {
        const metrics = createConnectorGatewayMetrics({
            operationalMetricsSource: {
                readOperationalSnapshot: () => Promise.resolve(snapshot)
            }
        });

        await expect(metrics.exporter.metrics()).rejects.toThrow(message);
    });

    it("fails the scrape when the durable backlog cannot be read", async () => {
        const metrics = createConnectorGatewayMetrics({
            operationalMetricsSource: {
                readOperationalSnapshot: () =>
                    Promise.reject(new Error("database unavailable"))
            }
        });

        await expect(metrics.exporter.metrics()).rejects.toThrow("database unavailable");
    });

    it("records bounded worker outcomes in Prometheus format", async () => {
        const metrics = createConnectorGatewayMetrics({
            currentTimeMilliseconds: () => 1_788_116_400_000
        });

        metrics.deliveryWorker.cycleStarted();
        expect(await metrics.exporter.metrics()).toContain(
            "connector_gateway_delivery_worker_cycle_active 1"
        );

        metrics.deliveryWorker.recordCompleted(CYCLE_RESULT, 0.25);
        const exposition = await metrics.exporter.metrics();

        expect(metrics.exporter.contentType).toBe(
            "text/plain; version=0.0.4; charset=utf-8"
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_cycles_total{outcome="completed"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_cycle_duration_seconds_count{outcome="completed"} 1'
        );
        expect(exposition).toContain("connector_gateway_delivery_worker_cycle_active 0");
        expect(exposition).toContain(
            "connector_gateway_delivery_worker_last_completed_unixtime 1788116400"
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_deliveries_total{outcome="claimed"} 5'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_deliveries_total{outcome="blocked_configuration"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_deliveries_total{outcome="delivered"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_deliveries_total{outcome="permanent_failure"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_deliveries_total{outcome="retryable_failure"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_deliveries_total{outcome="stale_claim"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_recovery_total{outcome="recovered"} 2'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_recovery_total{outcome="stale_claim"} 1'
        );
        expect(exposition).toContain("connector_gateway_process_cpu_user_seconds_total");
    });

    it("records failed and cancelled cycle durations", async () => {
        const metrics = createConnectorGatewayMetrics();

        metrics.deliveryWorker.cycleStarted();
        metrics.deliveryWorker.recordFailed(1.5);
        metrics.deliveryWorker.cycleStarted();
        metrics.deliveryWorker.recordCancelled(0.1);
        const exposition = await metrics.exporter.metrics();

        expect(exposition).toContain(
            'connector_gateway_delivery_worker_cycles_total{outcome="failed"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_cycles_total{outcome="cancelled"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_delivery_worker_cycle_duration_seconds_sum{outcome="failed"} 1.5'
        );
    });

    it.each([-1, Number.NaN])("rejects invalid duration %s", (durationSeconds) => {
        const metrics = createConnectorGatewayMetrics();

        expect(() => metrics.deliveryWorker.recordFailed(durationSeconds)).toThrow(
            "durationSeconds must be a nonnegative finite number"
        );
    });

    it.each([-1, 1.5])("rejects invalid result count %s", (claimed) => {
        const metrics = createConnectorGatewayMetrics();

        expect(() =>
            metrics.deliveryWorker.recordCompleted(
                {
                    ...CYCLE_RESULT,
                    processing: { ...CYCLE_RESULT.processing, claimed }
                },
                0
            )
        ).toThrow("claimed must be a nonnegative safe integer");
    });

    it("rejects recovery counts that do not reconcile", () => {
        const metrics = createConnectorGatewayMetrics();

        expect(() =>
            metrics.deliveryWorker.recordCompleted(
                {
                    ...CYCLE_RESULT,
                    recovery: { ...CYCLE_RESULT.recovery, found: 4 }
                },
                0
            )
        ).toThrow("recovery counts must reconcile");
    });

    it("rejects processing counts that do not reconcile", () => {
        const metrics = createConnectorGatewayMetrics();

        expect(() =>
            metrics.deliveryWorker.recordCompleted(
                {
                    ...CYCLE_RESULT,
                    processing: { ...CYCLE_RESULT.processing, claimed: 6 }
                },
                0
            )
        ).toThrow("processing counts must reconcile");
    });

    it("records ERP_B polling progress with bounded labels", async () => {
        const metrics = createConnectorGatewayMetrics({
            currentTimeMilliseconds: () => 1_788_116_400_000
        });
        const result: RunErpBPollingResult = {
            checkpointVersion: 4,
            createdDeliveries: 3,
            createdRejections: 1,
            cursor: "opaque-cursor-43",
            equivalentReplays: 2,
            outcome: "COMPLETED",
            pagesCommitted: 2
        };

        metrics.erpBPolling.runStarted();
        expect(await metrics.exporter.metrics()).toContain(
            "connector_gateway_erp_b_polling_run_active 1"
        );

        metrics.erpBPolling.recordResult(result, 0.5);
        const exposition = await metrics.exporter.metrics();

        expect(exposition).toContain(
            'connector_gateway_erp_b_polling_runs_total{outcome="completed"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_erp_b_polling_run_duration_seconds_sum{outcome="completed"} 0.5'
        );
        expect(exposition).toContain("connector_gateway_erp_b_polling_run_active 0");
        expect(exposition).toContain(
            "connector_gateway_erp_b_polling_last_successful_unixtime 1788116400"
        );
        expect(exposition).toContain("connector_gateway_erp_b_polling_pages_committed_total 2");
        expect(exposition).toContain(
            'connector_gateway_erp_b_polling_items_total{outcome="created_delivery"} 3'
        );
        expect(exposition).toContain(
            'connector_gateway_erp_b_polling_items_total{outcome="created_rejection"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_erp_b_polling_items_total{outcome="equivalent_replay"} 2'
        );
    });

    it.each([
        [{ outcome: "LEASE_UNAVAILABLE" } satisfies RunErpBPollingResult, "lease_unavailable"],
        [
            {
                createdDeliveries: 0,
                createdRejections: 0,
                equivalentReplays: 0,
                outcome: "LEASE_LOST",
                pagesCommitted: 0
            } satisfies RunErpBPollingResult,
            "lease_lost"
        ],
        [
            {
                createdDeliveries: 0,
                createdRejections: 0,
                equivalentReplays: 0,
                failure: { errorCode: "ERP_B_TIMEOUT", outcome: "RETRYABLE_FAILURE" },
                outcome: "PAGE_FAILED",
                pagesCommitted: 0
            } satisfies RunErpBPollingResult,
            "page_failed"
        ],
        [
            {
                checkpointVersion: 2,
                createdDeliveries: 0,
                createdRejections: 0,
                cursor: "next",
                equivalentReplays: 0,
                outcome: "PAGE_LIMIT_REACHED",
                pagesCommitted: 1
            } satisfies RunErpBPollingResult,
            "page_limit_reached"
        ]
    ] as const)("records polling result $1", async (result, expectedOutcome) => {
        const metrics = createConnectorGatewayMetrics();

        metrics.erpBPolling.recordResult(result, 0);

        expect(await metrics.exporter.metrics()).toContain(
            `connector_gateway_erp_b_polling_runs_total{outcome="${expectedOutcome}"} 1`
        );
    });

    it("records failed and cancelled polling runs", async () => {
        const metrics = createConnectorGatewayMetrics();

        metrics.erpBPolling.recordFailed(1.5);
        metrics.erpBPolling.recordCancelled(0.25);
        const exposition = await metrics.exporter.metrics();

        expect(exposition).toContain(
            'connector_gateway_erp_b_polling_runs_total{outcome="failed"} 1'
        );
        expect(exposition).toContain(
            'connector_gateway_erp_b_polling_runs_total{outcome="cancelled"} 1'
        );
    });

    it.each([-1, 1.5])("rejects invalid polling count %s", (pagesCommitted) => {
        const metrics = createConnectorGatewayMetrics();

        expect(() =>
            metrics.erpBPolling.recordResult(
                {
                    checkpointVersion: 2,
                    createdDeliveries: 0,
                    createdRejections: 0,
                    cursor: "next",
                    equivalentReplays: 0,
                    outcome: "PAGE_LIMIT_REACHED",
                    pagesCommitted
                },
                0
            )
        ).toThrow("pagesCommitted must be a nonnegative safe integer");
    });
});
