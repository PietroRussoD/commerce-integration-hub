import { describe, expect, it } from "vitest";

import { createConnectorGatewayMetrics } from "./delivery-worker-metrics.js";

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

describe("createConnectorGatewayMetrics", () => {
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
});
