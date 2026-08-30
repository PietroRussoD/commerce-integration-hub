import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDeliveryWorkerScheduler } from "./delivery-worker-scheduler.js";

const EMPTY_PROCESSING = {
    blockedConfigurations: 0,
    claimed: 0,
    delivered: 0,
    permanentFailures: 0,
    retryableFailures: 0,
    staleClaims: 0
};
const EMPTY_RECOVERY = { found: 0, recovered: 0, staleClaims: 0 };

describe("createDeliveryWorkerScheduler", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("runs immediately and schedules the next cycle only after completion", async () => {
        const firstCycle = deferred<typeof EMPTY_PROCESSING>();
        const dependencies = createDependencies();
        dependencies.recoverExpired.mockResolvedValue({
            found: 1,
            recovered: 1,
            staleClaims: 0
        });
        dependencies.processBatch.mockReturnValueOnce(firstCycle.promise);
        const scheduler = createDeliveryWorkerScheduler(dependencies);

        scheduler.start();
        scheduler.start();
        await flushPromises();
        expect(dependencies.recoverExpired).toHaveBeenCalledTimes(1);
        expect(dependencies.processBatch).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.recoverExpired).toHaveBeenCalledTimes(1);

        firstCycle.resolve({ ...EMPTY_PROCESSING, claimed: 1, delivered: 1 });
        await flushPromises();
        expect(dependencies.logger.info).toHaveBeenCalledWith(
            {
                processing: { ...EMPTY_PROCESSING, claimed: 1, delivered: 1 },
                recovery: { found: 1, recovered: 1, staleClaims: 0 }
            },
            "Delivery worker cycle completed"
        );

        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.recoverExpired).toHaveBeenCalledTimes(2);
        await scheduler.stop();
    });

    it("does not log an idle cycle", async () => {
        const dependencies = createDependencies();
        const scheduler = createDeliveryWorkerScheduler(dependencies);

        scheduler.start();
        await flushPromises();

        expect(dependencies.logger.info).not.toHaveBeenCalled();
        await scheduler.stop();
    });

    it("logs an unexpected failure and continues scheduling", async () => {
        const dependencies = createDependencies();
        const failure = new Error("database unavailable");
        dependencies.recoverExpired.mockRejectedValueOnce(failure);
        const scheduler = createDeliveryWorkerScheduler(dependencies);

        scheduler.start();
        await flushPromises();

        expect(dependencies.logger.error).toHaveBeenCalledWith(
            { err: failure },
            "Delivery worker cycle failed"
        );
        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.recoverExpired).toHaveBeenCalledTimes(2);
        await scheduler.stop();
    });

    it("aborts and waits for an active cycle without forwarding after recovery", async () => {
        const recovery = deferred<typeof EMPTY_RECOVERY>();
        const dependencies = createDependencies();
        dependencies.recoverExpired.mockReturnValue(recovery.promise);
        const scheduler = createDeliveryWorkerScheduler(dependencies);

        scheduler.start();
        const stopping = scheduler.stop();
        recovery.resolve(EMPTY_RECOVERY);
        await stopping;

        expect(dependencies.processBatch).not.toHaveBeenCalled();
        expect(dependencies.logger.error).not.toHaveBeenCalled();
    });

    it("does not log a failure produced while stopping", async () => {
        const recovery = deferred<typeof EMPTY_RECOVERY>();
        const dependencies = createDependencies();
        dependencies.recoverExpired.mockReturnValue(recovery.promise);
        const scheduler = createDeliveryWorkerScheduler(dependencies);

        scheduler.start();
        const stopping = scheduler.stop();
        recovery.reject(new Error("cancelled database operation"));
        await stopping;

        expect(dependencies.logger.error).not.toHaveBeenCalled();
    });

    it("cancels a pending timer and permits a later restart", async () => {
        const dependencies = createDependencies();
        const scheduler = createDeliveryWorkerScheduler(dependencies);

        scheduler.start();
        await flushPromises();
        await scheduler.stop();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.recoverExpired).toHaveBeenCalledTimes(1);

        scheduler.start();
        await flushPromises();
        expect(dependencies.recoverExpired).toHaveBeenCalledTimes(2);
        await scheduler.stop();
    });
});

function createDependencies() {
    return {
        intervalMilliseconds: 1_000,
        logger: {
            error: vi.fn(),
            info: vi.fn()
        },
        processBatch: vi.fn().mockResolvedValue(EMPTY_PROCESSING),
        recoverExpired: vi.fn().mockResolvedValue(EMPTY_RECOVERY)
    };
}

function deferred<T>() {
    let reject!: (reason: unknown) => void;
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        reject = rejectPromise;
        resolve = resolvePromise;
    });
    return { promise, reject, resolve };
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}
