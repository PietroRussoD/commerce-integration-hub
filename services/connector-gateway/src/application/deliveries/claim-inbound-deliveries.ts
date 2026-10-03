import type { CanonicalOrder } from "../orders/canonical-order.js";
import type { TraceContext } from "../observability/trace-context.js";

const MAX_BATCH_SIZE = 100;
const MAX_LEASE_DURATION_MILLISECONDS = 300_000;
const MAX_WORKER_ID_LENGTH = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ClaimInboundDeliveriesCommand {
    readonly claimedAt: Date;
    readonly leaseExpiresAt: Date;
    readonly leaseToken: string;
    readonly limit: number;
    readonly workerId: string;
}

export interface ClaimedInboundDelivery {
    readonly canonicalOrder: CanonicalOrder;
    readonly connectorId: string;
    readonly deliveryId: string;
    readonly leaseToken: string;
    readonly traceContext?: TraceContext;
}

export interface InboundDeliveryClaimRepository {
    claimEligible(
        command: ClaimInboundDeliveriesCommand
    ): Promise<readonly ClaimedInboundDelivery[]>;
}

export interface ClaimInboundDeliveriesDependencies {
    readonly batchSize: number;
    readonly createLeaseToken: () => string;
    readonly currentTimeMilliseconds?: () => number;
    readonly leaseDurationMilliseconds: number;
    readonly repository: InboundDeliveryClaimRepository;
    readonly workerId: string;
}

export type ClaimInboundDeliveriesUseCase = () => Promise<readonly ClaimedInboundDelivery[]>;

export function createClaimInboundDeliveriesUseCase({
    batchSize,
    createLeaseToken,
    currentTimeMilliseconds = Date.now,
    leaseDurationMilliseconds,
    repository,
    workerId
}: ClaimInboundDeliveriesDependencies): ClaimInboundDeliveriesUseCase {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
    }
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
        throw new Error(`batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}`);
    }
    if (
        !Number.isSafeInteger(leaseDurationMilliseconds) ||
        leaseDurationMilliseconds < 1 ||
        leaseDurationMilliseconds > MAX_LEASE_DURATION_MILLISECONDS
    ) {
        throw new Error(
            `leaseDurationMilliseconds must be an integer between 1 and ${MAX_LEASE_DURATION_MILLISECONDS}`
        );
    }

    return () => {
        const claimedAtMilliseconds = currentTimeMilliseconds();
        const leaseToken = createLeaseToken();
        if (!UUID_PATTERN.test(leaseToken)) {
            throw new Error("createLeaseToken must return a canonical UUID");
        }
        return repository.claimEligible({
            claimedAt: new Date(claimedAtMilliseconds),
            leaseExpiresAt: new Date(claimedAtMilliseconds + leaseDurationMilliseconds),
            leaseToken,
            limit: batchSize,
            workerId
        });
    };
}
