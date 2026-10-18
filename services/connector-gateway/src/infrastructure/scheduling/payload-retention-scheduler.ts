import type { PayloadRetentionMetrics } from "../observability/connector-gateway-metrics.js";

export interface PayloadRetentionScheduler {
    start(): void;
    stop(): Promise<void>;
}

export function createPayloadRetentionScheduler({
    clearBatch, intervalMilliseconds, logger, metrics
}: {
    readonly clearBatch: () => Promise<number>;
    readonly intervalMilliseconds: number;
    readonly logger: {
        error(message: string): void;
        info(context: { readonly cleared: number }, message: string): void;
    };
    readonly metrics: PayloadRetentionMetrics;
}): PayloadRetentionScheduler {
    let running = false;
    let activeBatch: Promise<void> | undefined;
    let timer: NodeJS.Timeout | undefined;

    const executeBatch = (): void => {
        timer = undefined;
        activeBatch = Promise.resolve().then(clearBatch)
            .then(cleared => {
                metrics.recordCompleted(cleared);
                if (cleared > 0) logger.info({ cleared }, "Expired terminal delivery payloads cleared");
            })
            .catch(() => {
                metrics.recordFailed();
                // Database error details may contain payload/connection data.
                logger.error("Payload retention batch failed");
            })
            .finally(() => {
                activeBatch = undefined;
                if (running) timer = setTimeout(executeBatch, intervalMilliseconds);
            });
    };

    return {
        start(): void {
            if (running || activeBatch !== undefined) return;
            running = true;
            executeBatch();
        },
        async stop(): Promise<void> {
            running = false;
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
            // Let the atomic SQL batch commit or roll back before pool teardown.
            await activeBatch;
        }
    };
}
