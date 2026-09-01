import type { AcquiredPollingLease } from "./acquire-polling-lease.js";
import type {
    CommitPolledOrderPageResult,
    PolledOrderPageRepository
} from "./commit-polled-order-page.js";
import type {
    ErpBOrderPageSource,
    FetchErpBOrderPageResult
} from "./fetch-erp-b-order-page.js";
import {
    classifyErpBOrderPage,
    type ErpBOrderPageClassificationResult
} from "../../connectors/erp-b/order-page-classifier.js";

const MAX_WORKER_ID_LENGTH = 100;

export interface ProcessErpBOrderPageCommand {
    readonly lease: AcquiredPollingLease;
    readonly signal?: AbortSignal;
}

type UnsuccessfulFetchResult = Exclude<
    FetchErpBOrderPageResult,
    { outcome: "PAGE_RECEIVED" }
>;
type UnsuccessfulCommitResult = Exclude<
    CommitPolledOrderPageResult,
    { outcome: "COMMITTED" }
>;

export type ProcessErpBOrderPageResult =
    | UnsuccessfulFetchResult
    | UnsuccessfulCommitResult
    | {
          readonly errorCode: "ERP_B_CONFLICTING_CHANGE_ID";
          readonly externalEventId: string;
          readonly outcome: "PROTOCOL_FAILURE";
      }
    | {
          readonly errorCode: "ERP_B_NON_ADVANCING_CURSOR";
          readonly outcome: "PROTOCOL_FAILURE";
      }
    | {
          readonly checkpointVersion: number;
          readonly createdDeliveries: number;
          readonly createdRejections: number;
          readonly equivalentReplays: number;
          readonly hasMore: boolean;
          readonly nextCursor: string;
          readonly outcome: "PAGE_COMMITTED";
      };

export interface ProcessErpBOrderPageDependencies {
    readonly classifyPage?: typeof classifyErpBOrderPage;
    readonly currentTimeMilliseconds?: () => number;
    readonly pageRepository: PolledOrderPageRepository;
    readonly pageSource: ErpBOrderPageSource;
    readonly workerId: string;
}

export type ProcessErpBOrderPageUseCase = (
    command: ProcessErpBOrderPageCommand
) => Promise<ProcessErpBOrderPageResult>;

export function createProcessErpBOrderPageUseCase({
    classifyPage = classifyErpBOrderPage,
    currentTimeMilliseconds = Date.now,
    pageRepository,
    pageSource,
    workerId
}: ProcessErpBOrderPageDependencies): ProcessErpBOrderPageUseCase {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
    }

    return async ({ lease, signal }) => {
        const fetchResult = await pageSource.fetchPage(
            signal === undefined ? { cursor: lease.cursor } : { cursor: lease.cursor, signal }
        );
        if (fetchResult.outcome !== "PAGE_RECEIVED") {
            return fetchResult;
        }
        if (fetchResult.page.nextCursor === lease.cursor) {
            return {
                errorCode: "ERP_B_NON_ADVANCING_CURSOR",
                outcome: "PROTOCOL_FAILURE"
            };
        }

        const classification = classifyPage(fetchResult.page);
        if (!classification.classified) {
            return classificationFailure(classification);
        }

        const page = classification.value;
        const commitResult = await pageRepository.commitPage({
            connectorId: lease.connectorId,
            expectedCheckpointVersion: lease.checkpointVersion,
            leaseOwner: workerId,
            leaseToken: lease.leaseToken,
            polledAt: new Date(currentTimeMilliseconds()),
            nextCursor: page.nextCursor,
            deliveries: page.deliveries,
            rejectedChanges: page.rejectedChanges
        });
        if (commitResult.outcome !== "COMMITTED") {
            return commitResult;
        }
        return {
            outcome: "PAGE_COMMITTED",
            checkpointVersion: commitResult.checkpointVersion,
            createdDeliveries: commitResult.createdDeliveries,
            createdRejections: commitResult.createdRejections,
            equivalentReplays: commitResult.equivalentReplays,
            hasMore: page.hasMore,
            nextCursor: page.nextCursor
        };
    };
}

function classificationFailure(
    classification: Extract<ErpBOrderPageClassificationResult, { classified: false }>
): ProcessErpBOrderPageResult {
    return {
        errorCode: "ERP_B_CONFLICTING_CHANGE_ID",
        externalEventId: classification.externalEventId,
        outcome: "PROTOCOL_FAILURE"
    };
}
