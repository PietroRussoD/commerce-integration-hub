import type {
    RunErpBPollingResult,
    RunErpBPollingUseCase
} from "../../application/polling/run-erp-b-polling.js";

interface ErpBPollingLogger {
    error(context: { readonly err: unknown }, message: string): void;
    info(context: { readonly result: RunErpBPollingResult }, message: string): void;
    warn(context: { readonly result: RunErpBPollingResult }, message: string): void;
}

export interface ErpBPollingSchedulerDependencies {
    readonly connectorId: string;
    readonly intervalMilliseconds: number;
    readonly logger: ErpBPollingLogger;
    readonly runPolling: RunErpBPollingUseCase;
}

export interface ErpBPollingScheduler {
    start(): void;
    stop(): Promise<void>;
}

export function createErpBPollingScheduler({
    connectorId,
    intervalMilliseconds,
    logger,
    runPolling
}: ErpBPollingSchedulerDependencies): ErpBPollingScheduler {
    let abortController: AbortController | undefined;
    let activeRun: Promise<void> | undefined;
    let running = false;
    let timer: NodeJS.Timeout | undefined;

    const executeRun = (): void => {
        const signal = abortController!.signal;
        activeRun = runPolling({ connectorId, signal })
            .then((result) => {
                if (!signal.aborted) {
                    logResult(logger, result);
                }
            })
            .catch((error: unknown) => {
                if (!signal.aborted) {
                    logger.error({ err: error }, "ERP_B polling run failed");
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
