import { describe, expect, it, vi } from "vitest";

import type { ErpBOrderPagePayload } from "../../connectors/erp-b/order-page-parser.js";
import type { AcquiredPollingLease } from "./acquire-polling-lease.js";
import type {
    CommitPolledOrderPageResult,
    PolledOrderPageRepository
} from "./commit-polled-order-page.js";
import type { FetchErpBOrderPageResult } from "./fetch-erp-b-order-page.js";
import {
    createProcessErpBOrderPageUseCase,
    type ProcessErpBOrderPageDependencies
} from "./process-erp-b-order-page.js";

const LEASE: AcquiredPollingLease = {
    checkpointVersion: 4,
    connectorId: "0199037b-6400-7000-8000-000000000002",
    cursor: "opaque-cursor-42",
    leaseExpiresAt: new Date("2026-09-01T09:01:00.000Z"),
    leaseToken: "0199037b-6400-7000-8000-000000000401"
};
const VALID_CHANGE = {
    changeId: "chg-00042",
    orderCode: "ERP-00042",
    currencyCode: "EUR",
    declaredTotal: "39.98",
    positions: [
        {
            positionId: "1",
            articleNumber: "SKU-BOOK-1",
            units: "2",
            pricePerUnit: "19.99"
        }
    ]
};
const PAGE: ErpBOrderPagePayload = {
    items: [VALID_CHANGE],
    nextCursor: "opaque-cursor-43",
    hasMore: true
};
const COMMITTED: CommitPolledOrderPageResult = {
    outcome: "COMMITTED",
    checkpointVersion: 5,
    createdDeliveries: 1,
    createdRejections: 0,
    equivalentReplays: 0
};

describe("createProcessErpBOrderPageUseCase", () => {
    it("fetches, classifies and commits one page under the acquired lease", async () => {
        const fetchPage = vi.fn().mockResolvedValue(pageReceived());
        const commitPage = vi
            .fn<PolledOrderPageRepository["commitPage"]>()
            .mockResolvedValue(COMMITTED);
        const processPage = createUseCase({
            pageRepository: { commitPage },
            pageSource: { fetchPage }
        });

        await expect(processPage({ lease: LEASE })).resolves.toEqual({
            outcome: "PAGE_COMMITTED",
            checkpointVersion: 5,
            createdDeliveries: 1,
            createdRejections: 0,
            equivalentReplays: 0,
            hasMore: true,
            nextCursor: "opaque-cursor-43"
        });
        expect(fetchPage).toHaveBeenCalledWith({ cursor: "opaque-cursor-42" });
        expect(commitPage).toHaveBeenCalledWith(
            expect.objectContaining({
                connectorId: LEASE.connectorId,
                expectedCheckpointVersion: 4,
                leaseOwner: "poller-a",
                leaseToken: LEASE.leaseToken,
                polledAt: new Date("2026-09-01T09:00:30.000Z"),
                nextCursor: "opaque-cursor-43"
            })
        );
        expect(commitPage.mock.calls[0]?.[0].deliveries).toHaveLength(1);
        expect(commitPage.mock.calls[0]?.[0].rejectedChanges).toHaveLength(0);
    });

    it("passes caller cancellation to the page source", async () => {
        const signal = new AbortController().signal;
        const fetchPage = vi.fn().mockResolvedValue(pageReceived());
        const processPage = createUseCase({ pageSource: { fetchPage } });

        await processPage({ lease: LEASE, signal });

        expect(fetchPage).toHaveBeenCalledWith({ cursor: "opaque-cursor-42", signal });
    });

    it("commits permanent mapping rejections with valid deliveries", async () => {
        const commitPage = vi
            .fn<PolledOrderPageRepository["commitPage"]>()
            .mockResolvedValue({
                ...COMMITTED,
                createdRejections: 1
            });
        const processPage = createUseCase({
            pageRepository: { commitPage },
            pageSource: {
                fetchPage: () =>
                    Promise.resolve(
                        pageReceived({
                            ...PAGE,
                            items: [
                                VALID_CHANGE,
                                {
                                    ...VALID_CHANGE,
                                    changeId: "chg-00043",
                                    orderCode: "ERP-00043",
                                    currencyCode: "JPY"
                                }
                            ]
                        })
                    )
            }
        });

        await expect(processPage({ lease: LEASE })).resolves.toMatchObject({
            outcome: "PAGE_COMMITTED",
            createdDeliveries: 1,
            createdRejections: 1
        });
        expect(commitPage.mock.calls[0]?.[0].deliveries).toHaveLength(1);
        expect(commitPage.mock.calls[0]?.[0].rejectedChanges).toHaveLength(1);
    });

    it.each([
        {
            errorCode: "ERP_B_AUTHENTICATION_REJECTED",
            httpStatus: 401,
            outcome: "BLOCKED_CONFIGURATION"
        },
        { errorCode: "ERP_B_TIMEOUT", outcome: "RETRYABLE_FAILURE" },
        {
            errorCode: "ERP_B_INVALID_RESPONSE",
            httpStatus: 200,
            outcome: "PROTOCOL_FAILURE"
        }
    ] as const)("preserves a $outcome fetch result without committing", async (fetchResult) => {
        const commitPage = vi.fn();
        const processPage = createUseCase({
            pageRepository: { commitPage },
            pageSource: { fetchPage: () => Promise.resolve(fetchResult) }
        });

        await expect(processPage({ lease: LEASE })).resolves.toEqual(fetchResult);
        expect(commitPage).not.toHaveBeenCalled();
    });

    it("rejects conflicting identities within a page without committing", async () => {
        const commitPage = vi.fn();
        const processPage = createUseCase({
            pageRepository: { commitPage },
            pageSource: {
                fetchPage: () =>
                    Promise.resolve(
                        pageReceived({
                            ...PAGE,
                            items: [
                                VALID_CHANGE,
                                {
                                    ...VALID_CHANGE,
                                    positions: [
                                        {
                                            ...VALID_CHANGE.positions[0]!,
                                            articleNumber: "SKU-BOOK-2"
                                        }
                                    ]
                                }
                            ]
                        })
                    )
            }
        });

        await expect(processPage({ lease: LEASE })).resolves.toEqual({
            errorCode: "ERP_B_CONFLICTING_CHANGE_ID",
            externalEventId: "chg-00042",
            outcome: "PROTOCOL_FAILURE"
        });
        expect(commitPage).not.toHaveBeenCalled();
    });

    it.each([
        { outcome: "STALE_CHECKPOINT" },
        { outcome: "PAYLOAD_CONFLICT", externalEventId: "chg-00042" }
    ] as const)("preserves a $outcome commit result", async (commitResult) => {
        const processPage = createUseCase({
            pageRepository: { commitPage: () => Promise.resolve(commitResult) }
        });

        await expect(processPage({ lease: LEASE })).resolves.toEqual(commitResult);
    });

    it.each(["", " ", "a".repeat(101)])("rejects invalid worker ID %j", (workerId) => {
        expect(() => createUseCase({ workerId })).toThrow(
            "workerId must contain between 1 and 100 characters"
        );
    });
});

function createUseCase(
    overrides: Partial<ProcessErpBOrderPageDependencies> = {}
): ReturnType<typeof createProcessErpBOrderPageUseCase> {
    return createProcessErpBOrderPageUseCase({
        currentTimeMilliseconds: () => Date.parse("2026-09-01T09:00:30.000Z"),
        pageRepository: { commitPage: () => Promise.resolve(COMMITTED) },
        pageSource: { fetchPage: () => Promise.resolve(pageReceived()) },
        workerId: "poller-a",
        ...overrides
    });
}

function pageReceived(page: ErpBOrderPagePayload = PAGE): FetchErpBOrderPageResult {
    return { outcome: "PAGE_RECEIVED", page };
}
