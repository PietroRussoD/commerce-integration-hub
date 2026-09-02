import {
    collectDefaultMetrics,
    Counter,
    Gauge,
    Histogram,
    Registry
} from "@prometheus-io/client";

import type { ProcessInboundDeliveryBatchResult } from "../../application/deliveries/process-inbound-delivery-batch.js";
import type { RunErpBPollingResult } from "../../application/polling/run-erp-b-polling.js";
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
const POLLING_RUN_OUTCOMES = [
    "cancelled",
    "completed",
    "failed",
    "lease_lost",
    "lease_unavailable",
    "page_failed",
    "page_limit_reached"
] as const;
const POLLING_ITEM_OUTCOMES = [
    "created_delivery",
    "created_rejection",
    "equivalent_replay"
] as const;
const CONNECTOR_STATUSES = ["active", "blocked_configuration", "disabled"] as const;

type CycleOutcome = (typeof CYCLE_OUTCOMES)[number];
type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];
type PollingRunOutcome = (typeof POLLING_RUN_OUTCOMES)[number];

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

export interface ErpBPollingMetrics {
    recordCancelled(durationSeconds: number): void;
    recordFailed(durationSeconds: number): void;
    recordResult(result: RunErpBPollingResult, durationSeconds: number): void;
    runStarted(): void;
}

export interface MetricsExporter {
    readonly contentType: string;
    metrics(): Promise<string>;
}

export interface GatewayOperationalSnapshot {
    readonly activeConnectors: number;
    readonly blockedConnectors: number;
    readonly disabledConnectors: number;
    readonly eligibleDeliveries: number;
    readonly lastSuccessfulPollAt: Date | null;
    readonly oldestEligibleReceivedAt: Date | null;
}

export interface GatewayOperationalMetricsSource {
    readOperationalSnapshot(observedAt: Date): Promise<GatewayOperationalSnapshot>;
}

export interface ConnectorGatewayMetrics {
    readonly deliveryWorker: DeliveryWorkerMetrics;
    readonly erpBPolling: ErpBPollingMetrics;
    readonly exporter: MetricsExporter;
}

export function createConnectorGatewayMetrics({
    currentTimeMilliseconds = Date.now,
    operationalMetricsSource
}: {
    readonly currentTimeMilliseconds?: () => number;
    readonly operationalMetricsSource?: GatewayOperationalMetricsSource;
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
    const deliveryBacklogOldestAge = new Gauge({
        help: "Age in seconds of the oldest delivery currently eligible for forwarding",
        name: "connector_gateway_delivery_backlog_oldest_age_seconds",
        registers: [registry]
    });
    const deliveryBacklog = new Gauge({
        help: "Number of deliveries currently eligible for forwarding",
        name: "connector_gateway_delivery_backlog",
        registers: [registry]
    });
    const connectorConfigurations = new Gauge({
        help: "Number of connector configurations by current status",
        labelNames: ["status"] as const,
        name: "connector_gateway_connector_configurations",
        registers: [registry]
    });
    const pollingRuns = new Counter({
        help: "Number of ERP_B polling runs by terminal outcome",
        labelNames: ["outcome"] as const,
        name: "connector_gateway_erp_b_polling_runs_total",
        registers: [registry]
    });
    const pollingRunDuration = new Histogram({
        buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
        help: "ERP_B polling run duration in seconds",
        labelNames: ["outcome"] as const,
        name: "connector_gateway_erp_b_polling_run_duration_seconds",
        registers: [registry]
    });
    const pollingRunActive = new Gauge({
        help: "Whether an ERP_B polling run is currently active",
        name: "connector_gateway_erp_b_polling_run_active",
        registers: [registry]
    });
    const pollingLastSuccessful = new Gauge({
        help: "Unix timestamp of the last successful ERP_B polling run",
        name: "connector_gateway_erp_b_polling_last_successful_unixtime",
        registers: [registry]
    });
    const pollingCheckpointAge = new Gauge({
        help: "Age in seconds of the latest durable successful ERP_B polling checkpoint",
        name: "connector_gateway_erp_b_polling_checkpoint_age_seconds",
        registers: [registry]
    });
    const pollingPages = new Counter({
        help: "Number of ERP_B pages committed by polling runs",
        name: "connector_gateway_erp_b_polling_pages_committed_total",
        registers: [registry]
    });
    const pollingItems = new Counter({
        help: "Number of ERP_B items observed by durable polling outcome",
        labelNames: ["outcome"] as const,
        name: "connector_gateway_erp_b_polling_items_total",
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
    for (const outcome of POLLING_RUN_OUTCOMES) {
        pollingRuns.inc({ outcome }, 0);
        pollingRunDuration.zero({ outcome });
    }
    for (const outcome of POLLING_ITEM_OUTCOMES) {
        pollingItems.inc({ outcome }, 0);
    }
    for (const status of CONNECTOR_STATUSES) {
        connectorConfigurations.set({ status }, 0);
    }
    cycleActive.set(0);
    lastCompleted.set(0);
    pollingRunActive.set(0);
    pollingLastSuccessful.set(0);
    pollingCheckpointAge.set(0);
    pollingPages.inc(0);
    deliveryBacklog.set(0);
    deliveryBacklogOldestAge.set(0);

    const finishCycle = (outcome: CycleOutcome, durationSeconds: number): void => {
        assertNonnegativeFinite(durationSeconds, "durationSeconds");
        cycles.inc({ outcome });
        cycleDuration.observe({ outcome }, durationSeconds);
        cycleActive.set(0);
    };

    const finishPollingRun = (outcome: PollingRunOutcome, durationSeconds: number): void => {
        assertNonnegativeFinite(durationSeconds, "durationSeconds");
        pollingRuns.inc({ outcome });
        pollingRunDuration.observe({ outcome }, durationSeconds);
        pollingRunActive.set(0);
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
        erpBPolling: {
            recordCancelled(durationSeconds): void {
                finishPollingRun("cancelled", durationSeconds);
            },
            recordFailed(durationSeconds): void {
                finishPollingRun("failed", durationSeconds);
            },
            recordResult(result, durationSeconds): void {
                const outcome = pollingRunOutcome(result);
                if ("pagesCommitted" in result) {
                    validatePollingProgress(result);
                    pollingPages.inc(result.pagesCommitted);
                    pollingItems.inc({ outcome: "created_delivery" }, result.createdDeliveries);
                    pollingItems.inc({ outcome: "created_rejection" }, result.createdRejections);
                    pollingItems.inc({ outcome: "equivalent_replay" }, result.equivalentReplays);
                }
                finishPollingRun(outcome, durationSeconds);
                if (result.outcome === "COMPLETED" || result.outcome === "PAGE_LIMIT_REACHED") {
                    pollingLastSuccessful.set(currentTimeMilliseconds() / 1_000);
                }
            },
            runStarted(): void {
                pollingRunActive.set(1);
            }
        },
        exporter: {
            contentType: registry.contentType,
            async metrics(): Promise<string> {
                if (operationalMetricsSource !== undefined) {
                    const observedAtMilliseconds = currentTimeMilliseconds();
                    const snapshot = await operationalMetricsSource.readOperationalSnapshot(
                        new Date(observedAtMilliseconds)
                    );
                    validateOperationalSnapshot(snapshot);
                    deliveryBacklog.set(snapshot.eligibleDeliveries);
                    deliveryBacklogOldestAge.set(
                        snapshot.oldestEligibleReceivedAt === null
                            ? 0
                            : Math.max(
                                  0,
                                  (observedAtMilliseconds -
                                      snapshot.oldestEligibleReceivedAt.getTime()) /
                                      1_000
                              )
                    );
                    connectorConfigurations.set(
                        { status: "active" },
                        snapshot.activeConnectors
                    );
                    connectorConfigurations.set(
                        { status: "blocked_configuration" },
                        snapshot.blockedConnectors
                    );
                    connectorConfigurations.set(
                        { status: "disabled" },
                        snapshot.disabledConnectors
                    );
                    pollingLastSuccessful.set(
                        snapshot.lastSuccessfulPollAt === null
                            ? 0
                            : snapshot.lastSuccessfulPollAt.getTime() / 1_000
                    );
                    pollingCheckpointAge.set(
                        snapshot.lastSuccessfulPollAt === null
                            ? 0
                            : Math.max(
                                  0,
                                  (observedAtMilliseconds -
                                      snapshot.lastSuccessfulPollAt.getTime()) /
                                      1_000
                              )
                    );
                }
                return registry.metrics();
            }
        }
    };
}

function pollingRunOutcome(result: RunErpBPollingResult): PollingRunOutcome {
    const outcomes: Readonly<Record<RunErpBPollingResult["outcome"], PollingRunOutcome>> = {
        COMPLETED: "completed",
        LEASE_LOST: "lease_lost",
        LEASE_UNAVAILABLE: "lease_unavailable",
        PAGE_FAILED: "page_failed",
        PAGE_LIMIT_REACHED: "page_limit_reached"
    };
    return outcomes[result.outcome];
}

function validatePollingProgress(
    result: Extract<RunErpBPollingResult, { readonly pagesCommitted: number }>
): void {
    for (const [name, value] of Object.entries({
        createdDeliveries: result.createdDeliveries,
        createdRejections: result.createdRejections,
        equivalentReplays: result.equivalentReplays,
        pagesCommitted: result.pagesCommitted
    })) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`${name} must be a nonnegative safe integer`);
        }
    }
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

function validateOperationalSnapshot(snapshot: GatewayOperationalSnapshot): void {
    for (const [name, value] of Object.entries({
        activeConnectors: snapshot.activeConnectors,
        blockedConnectors: snapshot.blockedConnectors,
        disabledConnectors: snapshot.disabledConnectors,
        eligibleDeliveries: snapshot.eligibleDeliveries
    })) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`${name} must be a nonnegative safe integer`);
        }
    }
    for (const [name, value] of Object.entries({
        lastSuccessfulPollAt: snapshot.lastSuccessfulPollAt,
        oldestEligibleReceivedAt: snapshot.oldestEligibleReceivedAt
    })) {
        if (value !== null && Number.isNaN(value.getTime())) {
            throw new Error(`${name} must be a valid date or null`);
        }
    }
    if (snapshot.eligibleDeliveries === 0 && snapshot.oldestEligibleReceivedAt !== null) {
        throw new Error("an empty backlog cannot have an oldest delivery");
    }
    if (snapshot.eligibleDeliveries > 0 && snapshot.oldestEligibleReceivedAt === null) {
        throw new Error("a non-empty backlog must have an oldest delivery");
    }
}

function assertNonnegativeFinite(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a nonnegative finite number`);
    }
}
