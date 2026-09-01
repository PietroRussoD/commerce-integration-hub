import type {
    AcquiredPollingLease,
    AcquirePollingLeaseUseCase
} from "./acquire-polling-lease.js";
import type {
    PollingLeaseIdentity,
    ReleasePollingLeaseUseCase,
    RenewPollingLeaseUseCase
} from "./maintain-polling-lease.js";
import type {
    ProcessErpBOrderPageResult,
    ProcessErpBOrderPageUseCase
} from "./process-erp-b-order-page.js";

const MAX_PAGES_PER_RUN = 100;

export interface RunErpBPollingCommand {
    readonly connectorId: string;
    readonly signal?: AbortSignal;
}

interface PollingRunProgress {
    readonly createdDeliveries: number;
    readonly createdRejections: number;
    readonly equivalentReplays: number;
    readonly pagesCommitted: number;
}

type PageFailure = Exclude<
    ProcessErpBOrderPageResult,
    { outcome: "PAGE_COMMITTED" } | { outcome: "STALE_CHECKPOINT" }
>;

export type RunErpBPollingResult =
    | { readonly outcome: "LEASE_UNAVAILABLE" }
    | (PollingRunProgress & {
          readonly checkpointVersion: number;
          readonly cursor: string;
          readonly outcome: "COMPLETED" | "PAGE_LIMIT_REACHED";
      })
    | (PollingRunProgress & { readonly outcome: "LEASE_LOST" })
    | (PollingRunProgress & {
          readonly failure: PageFailure;
          readonly outcome: "PAGE_FAILED";
      });

export interface RunErpBPollingDependencies {
    readonly acquireLease: AcquirePollingLeaseUseCase;
    readonly maxPagesPerRun: number;
    readonly processPage: ProcessErpBOrderPageUseCase;
    readonly releaseLease: ReleasePollingLeaseUseCase;
    readonly renewLease: RenewPollingLeaseUseCase;
}

export type RunErpBPollingUseCase = (
    command: RunErpBPollingCommand
) => Promise<RunErpBPollingResult>;

export function createRunErpBPollingUseCase({
    acquireLease,
    maxPagesPerRun,
    processPage,
    releaseLease,
    renewLease
}: RunErpBPollingDependencies): RunErpBPollingUseCase {
    if (
        !Number.isSafeInteger(maxPagesPerRun) ||
        maxPagesPerRun < 1 ||
        maxPagesPerRun > MAX_PAGES_PER_RUN
    ) {
        throw new Error(`maxPagesPerRun must be an integer between 1 and ${MAX_PAGES_PER_RUN}`);
    }

    return async ({ connectorId, signal }) => {
        const acquiredLease = await acquireLease(connectorId);
        if (acquiredLease === null) {
            return { outcome: "LEASE_UNAVAILABLE" };
        }

        const identity: PollingLeaseIdentity = {
            connectorId: acquiredLease.connectorId,
            leaseToken: acquiredLease.leaseToken
        };
        try {
            return await processAcquiredLease(acquiredLease, signal);
        } finally {
            await releaseLease(identity);
        }
    };

    async function processAcquiredLease(
        acquiredLease: AcquiredPollingLease,
        signal: AbortSignal | undefined
    ): Promise<RunErpBPollingResult> {
        let currentLease = acquiredLease;
        let progress: PollingRunProgress = emptyProgress();

        while (true) {
            const pageResult = await processPage(
                signal === undefined
                    ? { lease: currentLease }
                    : { lease: currentLease, signal }
            );
            if (pageResult.outcome === "STALE_CHECKPOINT") {
                return { ...progress, outcome: "LEASE_LOST" };
            }
            if (pageResult.outcome !== "PAGE_COMMITTED") {
                return { ...progress, failure: pageResult, outcome: "PAGE_FAILED" };
            }

            progress = {
                createdDeliveries: progress.createdDeliveries + pageResult.createdDeliveries,
                createdRejections: progress.createdRejections + pageResult.createdRejections,
                equivalentReplays: progress.equivalentReplays + pageResult.equivalentReplays,
                pagesCommitted: progress.pagesCommitted + 1
            };
            currentLease = {
                ...currentLease,
                checkpointVersion: pageResult.checkpointVersion,
                cursor: pageResult.nextCursor
            };

            if (!pageResult.hasMore) {
                return completed(
                    "COMPLETED",
                    progress,
                    pageResult.checkpointVersion,
                    pageResult.nextCursor
                );
            }
            if (progress.pagesCommitted >= maxPagesPerRun) {
                return completed(
                    "PAGE_LIMIT_REACHED",
                    progress,
                    pageResult.checkpointVersion,
                    pageResult.nextCursor
                );
            }

            const renewal = await renewLease({
                connectorId: currentLease.connectorId,
                leaseToken: currentLease.leaseToken
            });
            if (renewal === null) {
                return { ...progress, outcome: "LEASE_LOST" };
            }
            currentLease = { ...currentLease, leaseExpiresAt: renewal.leaseExpiresAt };
        }
    }
}

function emptyProgress(): PollingRunProgress {
    return {
        createdDeliveries: 0,
        createdRejections: 0,
        equivalentReplays: 0,
        pagesCommitted: 0
    };
}

function completed(
    outcome: "COMPLETED" | "PAGE_LIMIT_REACHED",
    progress: PollingRunProgress,
    checkpointVersion: number,
    cursor: string
): RunErpBPollingResult {
    return {
        ...progress,
        checkpointVersion,
        cursor,
        outcome
    };
}
