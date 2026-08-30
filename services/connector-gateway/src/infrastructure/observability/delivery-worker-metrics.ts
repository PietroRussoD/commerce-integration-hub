import {
    collectDefaultMetrics,
    Counter,
    Gauge,
    Histogram,
    Registry
} from "@prometheus-io/client";

import type { ProcessInboundDeliveryBatchResult } from "../../application/deliveries/process-inbound-delivery-batch.js";
import type { RecoverExpiredInboundDeliveriesResult } from "../../application/deliveries/recover-expired-inbound-deliveries.js";

const CYCLE_OUTCOMES = ["cancelled", "completed", "failed"] as const;
const DELIVERY_OUTCOMES = [
    "blocked_configuration",
    "claimed",
    "delivered",
    "permanent_failure",
    "retryable_failure",
    "stale_claim"
] as const;
const RECOVERY_OUTCOMES = ["recovered", "stale_claim"] as const;

type CycleOutcome = (typeof CYCLE_OUTCOMES)[number];
type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

export interface DeliveryWorkerCycleMetricsResult {
    readonly processing: ProcessInboundDeliveryBatchResult;
    readonly recovery: RecoverExpiredInboundDeliveriesResult;
}

export interface DeliveryWorkerMetrics {
    cycleStarted(): void;
    recordCancelled(durationSeconds: number): void;
    recordCompleted(
        result: DeliveryWorkerCycleMetricsResult,
        durationSeconds: number
    ): void;
    recordFailed(durationSeconds: number): void;
}

export interface MetricsExporter {
    readonly contentType: string;
    metrics(): Promise<string>;
}

export interface ConnectorGatewayMetrics {
    readonly deliveryWorker: DeliveryWorkerMetrics;
    readonly exporter: MetricsExporter;
}

export function createConnectorGatewayMetrics({
    currentTimeMilliseconds = Date.now
}: {
    readonly currentTimeMilliseconds?: () => number;
} = {}): ConnectorGatewayMetrics {
    const registry = new Registry();
    collectDefaultMetrics({ prefix: "connector_gateway_", register: registry });

    const cycles = new Counter({
        help: "Number of delivery worker cycles by terminal outcome",
        labelNames: ["outcome"] as const,
        name: "connector_gateway_delivery_worker_cycles_total",
        registers: [registry]
    });
    const cycleDuration = new Histogram({
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
        help: "Delivery worker cycle duration in seconds",
        labelNames: ["outcome"] as const,
        name: "connector_gateway_delivery_worker_cycle_duration_seconds",
        registers: [registry]
    });
    const cycleActive = new Gauge({
        help: "Whether a delivery worker cycle is currently active",
        name: "connector_gateway_delivery_worker_cycle_active",
        registers: [registry]
    });
    const lastCompleted = new Gauge({
        help: "Unix timestamp of the last completed delivery worker cycle",
        name: "connector_gateway_delivery_worker_last_completed_unixtime",
        registers: [registry]
    });
    const deliveryEvents = new Counter({
        help: "Number of deliveries observed by worker processing outcome",
        labelNames: ["outcome"] as const,
        name: "connector_gateway_delivery_worker_deliveries_total",
        registers: [registry]
    });
    const recoveryEvents = new Counter({
        help: "Number of expired delivery claims observed by recovery outcome",
        labelNames: ["outcome"] as const,
        name: "connector_gateway_delivery_worker_recovery_total",
        registers: [registry]
    });

    for (const outcome of CYCLE_OUTCOMES) {
        cycles.inc({ outcome }, 0);
        cycleDuration.zero({ outcome });
    }
    for (const outcome of DELIVERY_OUTCOMES) {
        deliveryEvents.inc({ outcome }, 0);
    }
    for (const outcome of RECOVERY_OUTCOMES) {
        recoveryEvents.inc({ outcome }, 0);
    }
    cycleActive.set(0);
    lastCompleted.set(0);

    const finishCycle = (outcome: CycleOutcome, durationSeconds: number): void => {
        assertNonnegativeFinite(durationSeconds, "durationSeconds");
        cycles.inc({ outcome });
        cycleDuration.observe({ outcome }, durationSeconds);
        cycleActive.set(0);
    };

    return {
        deliveryWorker: {
            cycleStarted(): void {
                cycleActive.set(1);
            },
            recordCancelled(durationSeconds): void {
                finishCycle("cancelled", durationSeconds);
            },
            recordCompleted(result, durationSeconds): void {
                validateCycleResult(result);
                finishCycle("completed", durationSeconds);
                lastCompleted.set(currentTimeMilliseconds() / 1_000);
                recordDeliveryOutcomes(deliveryEvents, result.processing);
                recoveryEvents.inc({ outcome: "recovered" }, result.recovery.recovered);
                recoveryEvents.inc(
                    { outcome: "stale_claim" },
                    result.recovery.staleClaims
                );
            },
            recordFailed(durationSeconds): void {
                finishCycle("failed", durationSeconds);
            }
        },
        exporter: registry
    };
}

function recordDeliveryOutcomes(
    counter: Counter<"outcome">,
    result: ProcessInboundDeliveryBatchResult
): void {
    const values: Readonly<Record<DeliveryOutcome, number>> = {
        blocked_configuration: result.blockedConfigurations,
        claimed: result.claimed,
        delivered: result.delivered,
        permanent_failure: result.permanentFailures,
        retryable_failure: result.retryableFailures,
        stale_claim: result.staleClaims
    };
    for (const outcome of DELIVERY_OUTCOMES) {
        counter.inc({ outcome }, values[outcome]);
    }
}

function validateCycleResult(result: DeliveryWorkerCycleMetricsResult): void {
    for (const [name, value] of Object.entries({
        ...result.processing,
        recoveryFound: result.recovery.found,
        recoveryRecovered: result.recovery.recovered,
        recoveryStaleClaims: result.recovery.staleClaims
    })) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`${name} must be a nonnegative safe integer`);
        }
    }
    if (result.recovery.found !== result.recovery.recovered + result.recovery.staleClaims) {
        throw new Error("recovery counts must reconcile");
    }
    if (
        result.processing.claimed !==
        result.processing.blockedConfigurations +
            result.processing.delivered +
            result.processing.permanentFailures +
            result.processing.retryableFailures +
            result.processing.staleClaims
    ) {
        throw new Error("processing counts must reconcile");
    }
}

function assertNonnegativeFinite(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a nonnegative finite number`);
    }
}
