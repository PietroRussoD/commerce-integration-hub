import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPayloadRetentionScheduler } from "./payload-retention-scheduler.js";

describe("payload retention scheduler", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("runs one batch immediately and waits for completion before scheduling another", async () => {
        const batch = Promise.withResolvers<number>();
        const dependencies = createDependencies();
        dependencies.clearBatch.mockReturnValueOnce(batch.promise);
        const scheduler = createPayloadRetentionScheduler(dependencies);
        scheduler.start();
        scheduler.start();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(dependencies.clearBatch).toHaveBeenCalledTimes(1);
        batch.resolve(50);
        await vi.advanceTimersByTimeAsync(0);
        expect(dependencies.metrics.recordCompleted).toHaveBeenCalledWith(50);
        expect(dependencies.logger.info).toHaveBeenCalledWith({ cleared: 50 }, "Expired terminal delivery payloads cleared");
        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.clearBatch).toHaveBeenCalledTimes(2);
        await scheduler.stop();
    });

    it("waits for an active atomic batch on stop and prevents restart during that wait", async () => {
        const batch = Promise.withResolvers<number>();
        const dependencies = createDependencies();
        dependencies.clearBatch.mockReturnValueOnce(batch.promise);
        const scheduler = createPayloadRetentionScheduler(dependencies);
        scheduler.start();
        await vi.advanceTimersByTimeAsync(0);
        let stopped = false;
        const stopping = scheduler.stop().then(() => { stopped = true; });
        scheduler.start();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(stopped).toBe(false);
        expect(dependencies.clearBatch).toHaveBeenCalledTimes(1);
        batch.resolve(1);
        await stopping;
        expect(stopped).toBe(true);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(dependencies.clearBatch).toHaveBeenCalledTimes(1);
        scheduler.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(dependencies.clearBatch).toHaveBeenCalledTimes(2);
        await scheduler.stop();
    });

    it("records failure without logging database details and tries again next interval", async () => {
        const dependencies = createDependencies();
        dependencies.clearBatch.mockRejectedValueOnce(new Error("Synthetic sensitive database detail"));
        const scheduler = createPayloadRetentionScheduler(dependencies);
        scheduler.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(dependencies.metrics.recordFailed).toHaveBeenCalledExactlyOnceWith();
        expect(dependencies.logger.error).toHaveBeenCalledExactlyOnceWith("Payload retention batch failed");
        expect(dependencies.logger.info).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.metrics.recordCompleted).toHaveBeenCalledWith(0);
        await scheduler.stop();
    });

    it("records a batch failure while stopping and settles without scheduling more work", async () => {
        const dependencies = createDependencies();
        const batch = Promise.withResolvers<number>();
        dependencies.clearBatch.mockReturnValueOnce(batch.promise);
        const scheduler = createPayloadRetentionScheduler(dependencies);
        scheduler.start();
        await vi.advanceTimersByTimeAsync(0);
        const stopping = scheduler.stop();
        batch.reject(new Error("Synthetic transaction rollback"));
        await stopping;
        expect(dependencies.metrics.recordFailed).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(dependencies.clearBatch).toHaveBeenCalledTimes(1);
    });

    it("cancels an idle timer, allows repeated stop, and does not log empty batches", async () => {
        const dependencies = createDependencies();
        const scheduler = createPayloadRetentionScheduler(dependencies);
        await scheduler.stop();
        scheduler.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(dependencies.logger.info).not.toHaveBeenCalled();
        await scheduler.stop();
        await scheduler.stop();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(dependencies.clearBatch).toHaveBeenCalledTimes(1);
    });
});

function createDependencies() {
    return {
        clearBatch: vi.fn<() => Promise<number>>().mockResolvedValue(0),
        intervalMilliseconds: 1_000,
        logger: { error: vi.fn(), info: vi.fn() },
        metrics: { recordCompleted: vi.fn(), recordFailed: vi.fn() }
    };
}
