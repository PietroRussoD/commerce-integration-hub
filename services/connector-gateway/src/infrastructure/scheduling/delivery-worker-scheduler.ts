import type { ProcessInboundDeliveryBatchResult } from "../../application/deliveries/process-inbound-delivery-batch.js";
import type { RecoverExpiredInboundDeliveriesResult } from "../../application/deliveries/recover-expired-inbound-deliveries.js";

interface DeliveryWorkerLogger {
    error(context: { readonly err: unknown }, message: string): void;
    info(context: DeliveryWorkerCycleResult, message: string): void;
}

interface DeliveryWorkerCycleResult {
    readonly processing: ProcessInboundDeliveryBatchResult;
    readonly recovery: RecoverExpiredInboundDeliveriesResult;
}

export interface DeliveryWorkerSchedulerDependencies {
    readonly intervalMilliseconds: number;
    readonly logger: DeliveryWorkerLogger;
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
    intervalMilliseconds,
    logger,
    processBatch,
    recoverExpired
}: DeliveryWorkerSchedulerDependencies): DeliveryWorkerScheduler {
    let abortController: AbortController | undefined;
    let activeCycle: Promise<void> | undefined;
    let running = false;
    let timer: NodeJS.Timeout | undefined;

    const executeCycle = (): void => {
        const signal = abortController!.signal;
        activeCycle = runCycle(signal)
            .catch((error: unknown) => {
                if (!signal.aborted) {
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

    const runCycle = async (signal: AbortSignal): Promise<void> => {
        const recovery = await recoverExpired();
        if (signal.aborted) {
            return;
        }
        const processing = await processBatch({ signal });
        if (recovery.found > 0 || processing.claimed > 0) {
            logger.info({ processing, recovery }, "Delivery worker cycle completed");
        }
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
