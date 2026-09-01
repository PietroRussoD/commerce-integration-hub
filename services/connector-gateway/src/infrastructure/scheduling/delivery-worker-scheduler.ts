import type { ProcessInboundDeliveryBatchResult } from "../../application/deliveries/process-inbound-delivery-batch.js";
import type { RecoverExpiredInboundDeliveriesResult } from "../../application/deliveries/recover-expired-inbound-deliveries.js";
import type { DeliveryWorkerMetrics } from "../observability/connector-gateway-metrics.js";

interface DeliveryWorkerLogger {
    error(context: { readonly err: unknown }, message: string): void;
    info(context: DeliveryWorkerCycleResult, message: string): void;
}

interface DeliveryWorkerCycleResult {
    readonly processing: ProcessInboundDeliveryBatchResult;
    readonly recovery: RecoverExpiredInboundDeliveriesResult;
}

export interface DeliveryWorkerSchedulerDependencies {
    readonly currentTimeMilliseconds?: () => number;
    readonly intervalMilliseconds: number;
    readonly logger: DeliveryWorkerLogger;
    readonly metrics: DeliveryWorkerMetrics;
    readonly processBatch: (request: {
        readonly signal: AbortSignal;
    }) => Promise<ProcessInboundDeliveryBatchResult>;
    readonly recoverExpired: () => Promise<RecoverExpiredInboundDeliveriesResult>;
}

export interface DeliveryWorkerScheduler {
    start(): void;
    stop(): Promise<void>;
}

export function createDeliveryWorkerScheduler({
    currentTimeMilliseconds = performance.now.bind(performance),
    intervalMilliseconds,
    logger,
    metrics,
    processBatch,
    recoverExpired
}: DeliveryWorkerSchedulerDependencies): DeliveryWorkerScheduler {
    let abortController: AbortController | undefined;
    let activeCycle: Promise<void> | undefined;
    let running = false;
    let timer: NodeJS.Timeout | undefined;

    const executeCycle = (): void => {
        const signal = abortController!.signal;
        const startedAtMilliseconds = currentTimeMilliseconds();
        metrics.cycleStarted();
        activeCycle = runCycle(signal)
            .then((result) => {
                const durationSeconds = elapsedSeconds(
                    startedAtMilliseconds,
                    currentTimeMilliseconds()
                );
                if (result === undefined) {
                    metrics.recordCancelled(durationSeconds);
                } else {
                    metrics.recordCompleted(result, durationSeconds);
                }
            })
            .catch((error: unknown) => {
                const durationSeconds = elapsedSeconds(
                    startedAtMilliseconds,
                    currentTimeMilliseconds()
                );
                if (signal.aborted) {
                    metrics.recordCancelled(durationSeconds);
                } else {
                    metrics.recordFailed(durationSeconds);
                    logger.error({ err: error }, "Delivery worker cycle failed");
                }
            })
            .finally(() => {
                activeCycle = undefined;
                if (running) {
                    timer = setTimeout(executeCycle, intervalMilliseconds);
                }
            });
    };

    const runCycle = async (
        signal: AbortSignal
    ): Promise<DeliveryWorkerCycleResult | undefined> => {
        const recovery = await recoverExpired();
        if (signal.aborted) {
            return undefined;
        }
        const processing = await processBatch({ signal });
        const result = { processing, recovery };
        if (recovery.found > 0 || processing.claimed > 0) {
            logger.info(result, "Delivery worker cycle completed");
        }
        return result;
    };

    return {
        start(): void {
            if (running) {
                return;
            }
            running = true;
            abortController = new AbortController();
            executeCycle();
        },
        async stop(): Promise<void> {
            running = false;
            abortController?.abort();
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
            await activeCycle;
        }
    };
}

function elapsedSeconds(startedAtMilliseconds: number, completedAtMilliseconds: number): number {
    return Math.max(0, completedAtMilliseconds - startedAtMilliseconds) / 1_000;
}
