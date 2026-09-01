import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    RunErpBPollingResult,
    RunErpBPollingUseCase
} from "../../application/polling/run-erp-b-polling.js";
import {
    createErpBPollingScheduler
} from "./erp-b-polling-scheduler.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const COMPLETED: RunErpBPollingResult = {
    outcome: "COMPLETED",
    checkpointVersion: 5,
    cursor: "opaque-cursor-43",
    createdDeliveries: 1,
    createdRejections: 0,
    equivalentReplays: 0,
    pagesCommitted: 1
};

describe("createErpBPollingScheduler", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("runs immediately and schedules again only after completion", async () => {
        const firstRun = deferred<RunErpBPollingResult>();
        const dependencies = createDependencies();
        dependencies.runPolling.mockReturnValueOnce(firstRun.promise);
        const scheduler = createErpBPollingScheduler(dependencies);

        scheduler.start();
        scheduler.start();
        await flushPromises();
        expect(dependencies.runPolling).toHaveBeenCalledTimes(1);
        expect(dependencies.runPolling.mock.calls[0]?.[0].connectorId).toBe(CONNECTOR_ID);
        expect(dependencies.runPolling.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);

        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.runPolling).toHaveBeenCalledTimes(1);

        firstRun.resolve(COMPLETED);
        await flushPromises();
        expect(dependencies.logger.info).toHaveBeenCalledWith(
            { result: COMPLETED },
            "ERP_B polling run completed"
        );

        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.runPolling).toHaveBeenCalledTimes(2);
        await scheduler.stop();
    });

    it("does not log unavailable ownership as activity", async () => {
        const dependencies = createDependencies();
        dependencies.runPolling.mockResolvedValue({ outcome: "LEASE_UNAVAILABLE" });
        const scheduler = createErpBPollingScheduler(dependencies);

        scheduler.start();
        await flushPromises();

        expect(dependencies.logger.info).not.toHaveBeenCalled();
        expect(dependencies.logger.warn).not.toHaveBeenCalled();
        await scheduler.stop();
    });

    it.each([
        [
            {
                outcome: "PAGE_LIMIT_REACHED",
                checkpointVersion: 5,
                cursor: "opaque-cursor-43",
                createdDeliveries: 1,
                createdRejections: 0,
                equivalentReplays: 0,
                pagesCommitted: 1
            } satisfies RunErpBPollingResult,
            "info",
            "ERP_B polling run completed"
        ],
        [
            {
                outcome: "LEASE_LOST",
                createdDeliveries: 1,
                createdRejections: 0,
                equivalentReplays: 0,
                pagesCommitted: 1
            } satisfies RunErpBPollingResult,
            "warn",
            "ERP_B polling lease lost"
        ],
        [
            {
                outcome: "PAGE_FAILED",
                failure: { errorCode: "ERP_B_TIMEOUT", outcome: "RETRYABLE_FAILURE" },
                createdDeliveries: 0,
                createdRejections: 0,
                equivalentReplays: 0,
                pagesCommitted: 0
            } satisfies RunErpBPollingResult,
            "warn",
            "ERP_B polling page failed"
        ]
    ] as const)("logs $0 at $1", async (result, level, message) => {
        const dependencies = createDependencies();
        dependencies.runPolling.mockResolvedValue(result);
        const scheduler = createErpBPollingScheduler(dependencies);

        scheduler.start();
        await flushPromises();

        expect(dependencies.logger[level]).toHaveBeenCalledWith({ result }, message);
        await scheduler.stop();
    });

    it("logs an unexpected failure and continues scheduling", async () => {
        const dependencies = createDependencies();
        const failure = new Error("provider adapter unavailable");
        dependencies.runPolling.mockRejectedValueOnce(failure);
        const scheduler = createErpBPollingScheduler(dependencies);

        scheduler.start();
        await flushPromises();

        expect(dependencies.logger.error).toHaveBeenCalledWith(
            { err: failure },
            "ERP_B polling run failed"
        );
        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.runPolling).toHaveBeenCalledTimes(2);
        await scheduler.stop();
    });

    it("aborts and waits for an active run without logging cancellation", async () => {
        const activeRun = deferred<RunErpBPollingResult>();
        const dependencies = createDependencies();
        dependencies.runPolling.mockReturnValue(activeRun.promise);
        const scheduler = createErpBPollingScheduler(dependencies);

        scheduler.start();
        const signal = dependencies.runPolling.mock.calls[0]?.[0].signal;
        const stopping = scheduler.stop();
        expect(signal?.aborted).toBe(true);
        activeRun.resolve({
            outcome: "PAGE_FAILED",
            failure: { errorCode: "ERP_B_REQUEST_ABORTED", outcome: "RETRYABLE_FAILURE" },
            createdDeliveries: 0,
            createdRejections: 0,
            equivalentReplays: 0,
            pagesCommitted: 0
        });
        await stopping;

        expect(dependencies.logger.info).not.toHaveBeenCalled();
        expect(dependencies.logger.warn).not.toHaveBeenCalled();
        expect(dependencies.logger.error).not.toHaveBeenCalled();
    });

    it("suppresses an exception produced while stopping", async () => {
        const activeRun = deferred<RunErpBPollingResult>();
        const dependencies = createDependencies();
        dependencies.runPolling.mockReturnValue(activeRun.promise);
        const scheduler = createErpBPollingScheduler(dependencies);

        scheduler.start();
        const stopping = scheduler.stop();
        activeRun.reject(new Error("cancelled provider request"));
        await stopping;

        expect(dependencies.logger.error).not.toHaveBeenCalled();
    });

    it("cancels a pending timer and permits restart", async () => {
        const dependencies = createDependencies();
        const scheduler = createErpBPollingScheduler(dependencies);

        scheduler.start();
        await flushPromises();
        await scheduler.stop();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(dependencies.runPolling).toHaveBeenCalledTimes(1);

        scheduler.start();
        await flushPromises();
        expect(dependencies.runPolling).toHaveBeenCalledTimes(2);
        await scheduler.stop();
    });
});

function createDependencies() {
    return {
        connectorId: CONNECTOR_ID,
        intervalMilliseconds: 1_000,
        logger: {
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn()
        },
        runPolling: vi.fn<RunErpBPollingUseCase>().mockResolvedValue(COMPLETED)
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
