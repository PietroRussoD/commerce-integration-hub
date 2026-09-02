import { describe, expect, it, vi } from "vitest";

import type { AcquirePollingLeaseUseCase } from "./acquire-polling-lease.js";
import type { BlockPollingConnectorUseCase } from "./block-polling-connector.js";
import type {
    ReleasePollingLeaseUseCase,
    RenewPollingLeaseUseCase
} from "./maintain-polling-lease.js";
import type { ProcessErpBOrderPageUseCase } from "./process-erp-b-order-page.js";
import {
    createRunErpBPollingUseCase,
    type RunErpBPollingDependencies
} from "./run-erp-b-polling.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000401";
const ACQUIRED_LEASE = {
    checkpointVersion: 4,
    connectorId: CONNECTOR_ID,
    cursor: "opaque-cursor-42",
    leaseExpiresAt: new Date("2026-09-01T09:01:00.000Z"),
    leaseToken: LEASE_TOKEN
};
const FIRST_PAGE = {
    outcome: "PAGE_COMMITTED" as const,
    checkpointVersion: 5,
    createdDeliveries: 2,
    createdRejections: 1,
    equivalentReplays: 0,
    hasMore: true,
    nextCursor: "opaque-cursor-43"
};
const FINAL_PAGE = {
    outcome: "PAGE_COMMITTED" as const,
    checkpointVersion: 6,
    createdDeliveries: 1,
    createdRejections: 0,
    equivalentReplays: 1,
    hasMore: false,
    nextCursor: "opaque-cursor-44"
};

describe("createRunErpBPollingUseCase", () => {
    it("returns without processing when the polling lease is unavailable", async () => {
        const processPage = processPageMock();
        const releaseLease = releaseLeaseMock();
        const run = createUseCase({
            acquireLease: vi.fn<AcquirePollingLeaseUseCase>().mockResolvedValue(null),
            processPage,
            releaseLease
        });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toEqual({
            outcome: "LEASE_UNAVAILABLE"
        });
        expect(processPage).not.toHaveBeenCalled();
        expect(releaseLease).not.toHaveBeenCalled();
    });

    it("completes a final page and releases its lease", async () => {
        const processPage = processPageMock().mockResolvedValue(FINAL_PAGE);
        const renewLease = renewLeaseMock();
        const releaseLease = releaseLeaseMock();
        const run = createUseCase({ processPage, releaseLease, renewLease });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toEqual({
            outcome: "COMPLETED",
            checkpointVersion: 6,
            cursor: "opaque-cursor-44",
            createdDeliveries: 1,
            createdRejections: 0,
            equivalentReplays: 1,
            pagesCommitted: 1
        });
        expect(renewLease).not.toHaveBeenCalled();
        expect(releaseLease).toHaveBeenCalledWith({
            connectorId: CONNECTOR_ID,
            leaseToken: LEASE_TOKEN
        });
    });

    it("renews between pages and aggregates committed progress", async () => {
        const signal = new AbortController().signal;
        const processPage = processPageMock()
            .mockResolvedValueOnce(FIRST_PAGE)
            .mockResolvedValueOnce(FINAL_PAGE);
        const renewedExpiry = new Date("2026-09-01T09:01:30.000Z");
        const renewLease = renewLeaseMock().mockResolvedValue({
            leaseExpiresAt: renewedExpiry
        });
        const run = createUseCase({ processPage, renewLease });

        await expect(run({ connectorId: CONNECTOR_ID, signal })).resolves.toEqual({
            outcome: "COMPLETED",
            checkpointVersion: 6,
            cursor: "opaque-cursor-44",
            createdDeliveries: 3,
            createdRejections: 1,
            equivalentReplays: 1,
            pagesCommitted: 2
        });
        expect(renewLease).toHaveBeenCalledWith({
            connectorId: CONNECTOR_ID,
            leaseToken: LEASE_TOKEN
        });
        expect(processPage).toHaveBeenNthCalledWith(1, {
            lease: ACQUIRED_LEASE,
            signal
        });
        expect(processPage).toHaveBeenNthCalledWith(2, {
            lease: {
                ...ACQUIRED_LEASE,
                checkpointVersion: 5,
                cursor: "opaque-cursor-43",
                leaseExpiresAt: renewedExpiry
            },
            signal
        });
    });

    it("stops at the configured page limit without an unnecessary renewal", async () => {
        const renewLease = renewLeaseMock();
        const run = createUseCase({
            maxPagesPerRun: 1,
            processPage: processPageMock().mockResolvedValue(FIRST_PAGE),
            renewLease
        });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toEqual({
            outcome: "PAGE_LIMIT_REACHED",
            checkpointVersion: 5,
            cursor: "opaque-cursor-43",
            createdDeliveries: 2,
            createdRejections: 1,
            equivalentReplays: 0,
            pagesCommitted: 1
        });
        expect(renewLease).not.toHaveBeenCalled();
    });

    it("returns a typed page failure with progress and releases the lease", async () => {
        const releaseLease = releaseLeaseMock();
        const failure = { errorCode: "ERP_B_TIMEOUT" as const, outcome: "RETRYABLE_FAILURE" as const };
        const run = createUseCase({
            processPage: processPageMock()
                .mockResolvedValueOnce(FIRST_PAGE)
                .mockResolvedValueOnce(failure),
            releaseLease
        });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toEqual({
            outcome: "PAGE_FAILED",
            failure,
            createdDeliveries: 2,
            createdRejections: 1,
            equivalentReplays: 0,
            pagesCommitted: 1
        });
        expect(releaseLease).toHaveBeenCalledOnce();
    });

    it("blocks the connector after provider authentication is rejected", async () => {
        const blockConnector = vi.fn<BlockPollingConnectorUseCase>().mockResolvedValue(true);
        const failure = {
            errorCode: "ERP_B_AUTHENTICATION_REJECTED" as const,
            httpStatus: 401 as const,
            outcome: "BLOCKED_CONFIGURATION" as const
        };
        const run = createUseCase({
            blockConnector,
            processPage: processPageMock().mockResolvedValue(failure)
        });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toMatchObject({
            failure,
            outcome: "PAGE_FAILED"
        });
        expect(blockConnector).toHaveBeenCalledWith({
            connectorId: CONNECTOR_ID,
            leaseToken: LEASE_TOKEN
        });
    });

    it("reports lease loss when a stale poller cannot block the connector", async () => {
        const run = createUseCase({
            blockConnector: vi.fn<BlockPollingConnectorUseCase>().mockResolvedValue(false),
            processPage: processPageMock().mockResolvedValue({
                errorCode: "ERP_B_AUTHENTICATION_REJECTED",
                httpStatus: 403,
                outcome: "BLOCKED_CONFIGURATION"
            })
        });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toMatchObject({
            outcome: "LEASE_LOST",
            pagesCommitted: 0
        });
    });

    it("does not block the connector for a retryable provider failure", async () => {
        const blockConnector = vi.fn<BlockPollingConnectorUseCase>();
        const run = createUseCase({
            blockConnector,
            processPage: processPageMock().mockResolvedValue({
                errorCode: "ERP_B_TIMEOUT",
                outcome: "RETRYABLE_FAILURE"
            })
        });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toMatchObject({
            outcome: "PAGE_FAILED"
        });
        expect(blockConnector).not.toHaveBeenCalled();
    });

    it("reports lease loss when the page commit is stale", async () => {
        const run = createUseCase({
            processPage: processPageMock().mockResolvedValue({
                outcome: "STALE_CHECKPOINT"
            })
        });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toMatchObject({
            outcome: "LEASE_LOST",
            pagesCommitted: 0
        });
    });

    it("reports lease loss when heartbeat renewal is stale", async () => {
        const run = createUseCase({
            processPage: processPageMock().mockResolvedValue(FIRST_PAGE),
            renewLease: renewLeaseMock().mockResolvedValue(null)
        });

        await expect(run({ connectorId: CONNECTOR_ID })).resolves.toEqual({
            outcome: "LEASE_LOST",
            createdDeliveries: 2,
            createdRejections: 1,
            equivalentReplays: 0,
            pagesCommitted: 1
        });
    });

    it("releases the lease when page processing throws", async () => {
        const releaseLease = releaseLeaseMock();
        const run = createUseCase({
            processPage: processPageMock().mockRejectedValue(new Error("database unavailable")),
            releaseLease
        });

        await expect(run({ connectorId: CONNECTOR_ID })).rejects.toThrow("database unavailable");
        expect(releaseLease).toHaveBeenCalledOnce();
    });

    it("propagates a release infrastructure failure", async () => {
        const run = createUseCase({
            processPage: processPageMock().mockResolvedValue(FINAL_PAGE),
            releaseLease: releaseLeaseMock().mockRejectedValue(new Error("release unavailable"))
        });

        await expect(run({ connectorId: CONNECTOR_ID })).rejects.toThrow("release unavailable");
    });

    it.each([0, -1, 101, 1.5, Number.NaN])(
        "rejects invalid page limit %s",
        (maxPagesPerRun) => {
            expect(() => createUseCase({ maxPagesPerRun })).toThrow(
                "maxPagesPerRun must be an integer between 1 and 100"
            );
        }
    );
});

function createUseCase(
    overrides: Partial<RunErpBPollingDependencies> = {}
): ReturnType<typeof createRunErpBPollingUseCase> {
    return createRunErpBPollingUseCase({
        acquireLease: vi.fn<AcquirePollingLeaseUseCase>().mockResolvedValue(ACQUIRED_LEASE),
        blockConnector: vi.fn<BlockPollingConnectorUseCase>().mockResolvedValue(true),
        maxPagesPerRun: 10,
        processPage: processPageMock().mockResolvedValue(FINAL_PAGE),
        releaseLease: releaseLeaseMock().mockResolvedValue(true),
        renewLease: renewLeaseMock().mockResolvedValue({
            leaseExpiresAt: new Date("2026-09-01T09:01:30.000Z")
        }),
        ...overrides
    });
}

function processPageMock(): ReturnType<typeof vi.fn<ProcessErpBOrderPageUseCase>> {
    return vi.fn<ProcessErpBOrderPageUseCase>();
}

function renewLeaseMock(): ReturnType<typeof vi.fn<RenewPollingLeaseUseCase>> {
    return vi.fn<RenewPollingLeaseUseCase>();
}

function releaseLeaseMock(): ReturnType<typeof vi.fn<ReleasePollingLeaseUseCase>> {
    return vi.fn<ReleasePollingLeaseUseCase>();
}
