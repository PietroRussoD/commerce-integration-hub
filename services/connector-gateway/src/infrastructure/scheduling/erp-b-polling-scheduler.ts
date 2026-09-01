import type {
    RunErpBPollingResult,
    RunErpBPollingUseCase
} from "../../application/polling/run-erp-b-polling.js";
import type { ErpBPollingMetrics } from "../observability/connector-gateway-metrics.js";

interface ErpBPollingLogger {
    error(context: { readonly err: unknown }, message: string): void;
    info(context: { readonly result: RunErpBPollingResult }, message: string): void;
    warn(context: { readonly result: RunErpBPollingResult }, message: string): void;
}

export interface ErpBPollingSchedulerDependencies {
    readonly connectorId: string;
    readonly currentTimeMilliseconds?: () => number;
    readonly intervalMilliseconds: number;
    readonly logger: ErpBPollingLogger;
    readonly metrics: ErpBPollingMetrics;
    readonly runPolling: RunErpBPollingUseCase;
}

export interface ErpBPollingScheduler {
    start(): void;
    stop(): Promise<void>;
}

export function createErpBPollingScheduler({
    connectorId,
    currentTimeMilliseconds = performance.now.bind(performance),
    intervalMilliseconds,
    logger,
    metrics,
    runPolling
}: ErpBPollingSchedulerDependencies): ErpBPollingScheduler {
    let abortController: AbortController | undefined;
    let activeRun: Promise<void> | undefined;
    let running = false;
    let timer: NodeJS.Timeout | undefined;

    const executeRun = (): void => {
        const signal = abortController!.signal;
        const startedAtMilliseconds = currentTimeMilliseconds();
        metrics.runStarted();
        activeRun = runPolling({ connectorId, signal })
            .then((result) => {
                const durationSeconds = elapsedSeconds(
                    startedAtMilliseconds,
                    currentTimeMilliseconds()
                );
                if (!signal.aborted) {
                    metrics.recordResult(result, durationSeconds);
                    logResult(logger, result);
                } else {
                    metrics.recordCancelled(durationSeconds);
                }
            })
            .catch((error: unknown) => {
                const durationSeconds = elapsedSeconds(
                    startedAtMilliseconds,
                    currentTimeMilliseconds()
                );
                if (!signal.aborted) {
                    metrics.recordFailed(durationSeconds);
                    logger.error({ err: error }, "ERP_B polling run failed");
                } else {
                    metrics.recordCancelled(durationSeconds);
                }
            })
            .finally(() => {
                activeRun = undefined;
                if (running) {
                    timer = setTimeout(executeRun, intervalMilliseconds);
                }
            });
    };

    return {
        start(): void {
            if (running) {
                return;
            }
            running = true;
            abortController = new AbortController();
            executeRun();
        },
        async stop(): Promise<void> {
            running = false;
            abortController?.abort();
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
            await activeRun;
        }
    };
}

function elapsedSeconds(startedAtMilliseconds: number, completedAtMilliseconds: number): number {
    return Math.max(0, completedAtMilliseconds - startedAtMilliseconds) / 1_000;
}

function logResult(logger: ErpBPollingLogger, result: RunErpBPollingResult): void {
    switch (result.outcome) {
        case "LEASE_UNAVAILABLE":
            return;
        case "COMPLETED":
        case "PAGE_LIMIT_REACHED":
            logger.info({ result }, "ERP_B polling run completed");
            return;
        case "LEASE_LOST":
            logger.warn({ result }, "ERP_B polling lease lost");
            return;
        case "PAGE_FAILED":
            logger.warn({ result }, "ERP_B polling page failed");
    }
}
