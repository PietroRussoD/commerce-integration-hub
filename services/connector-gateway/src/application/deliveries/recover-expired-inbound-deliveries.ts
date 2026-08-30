import {
    decideInboundDeliveryRetry,
    hasInboundDeliveryDeadlineElapsed
} from "./inbound-delivery-retry-policy.js";

const MAX_BATCH_SIZE = 100;

export interface ExpiredInboundDelivery {
    readonly attemptId: string | null;
    readonly attemptNumber: number;
    readonly deliveryId: string;
    readonly deliveryReceivedAt: Date;
    readonly leaseOwner: string;
    readonly leaseToken: string;
}

export interface FindExpiredInboundDeliveriesCommand {
    readonly expiredAt: Date;
    readonly limit: number;
}

interface RecoverExpiredInboundDeliveryCommandBase {
    readonly attemptId: string | null;
    readonly attemptNumber: number;
    readonly deliveryId: string;
    readonly errorCode: "ATTEMPT_LEASE_EXPIRED" | "CLAIM_LEASE_EXPIRED";
    readonly leaseOwner: string;
    readonly leaseToken: string;
    readonly recoveredAt: Date;
}

export type RecoverExpiredInboundDeliveryCommand =
    | (RecoverExpiredInboundDeliveryCommandBase & {
          readonly nextAttemptAt: Date;
          readonly targetStatus: "RETRY_WAIT";
      })
    | (RecoverExpiredInboundDeliveryCommandBase & {
          readonly targetStatus: "EXHAUSTED";
      });

export type RecoverExpiredInboundDeliveryResult =
    | { readonly outcome: "RECOVERED" }
    | { readonly outcome: "STALE_CLAIM" };

export interface ExpiredInboundDeliveryRepository {
    findExpired(
        command: FindExpiredInboundDeliveriesCommand
    ): Promise<readonly ExpiredInboundDelivery[]>;
    recoverExpired(
        command: RecoverExpiredInboundDeliveryCommand
    ): Promise<RecoverExpiredInboundDeliveryResult>;
}

export interface RecoverExpiredInboundDeliveriesDependencies {
    readonly batchSize: number;
    readonly currentTimeMilliseconds?: () => number;
    readonly random?: () => number;
    readonly repository: ExpiredInboundDeliveryRepository;
}

export interface RecoverExpiredInboundDeliveriesResult {
    readonly found: number;
    readonly recovered: number;
    readonly staleClaims: number;
}

export function createRecoverExpiredInboundDeliveriesUseCase({
    batchSize,
    currentTimeMilliseconds = Date.now,
    random = Math.random,
    repository
}: RecoverExpiredInboundDeliveriesDependencies) {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
        throw new Error(`batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}`);
    }

    return async (): Promise<RecoverExpiredInboundDeliveriesResult> => {
        const recoveredAt = new Date(currentTimeMilliseconds());
        const expiredDeliveries = await repository.findExpired({
            expiredAt: recoveredAt,
            limit: batchSize
        });
        let recovered = 0;

        for (const delivery of expiredDeliveries) {
            const result = await repository.recoverExpired(
                buildRecoveryCommand(delivery, recoveredAt, random)
            );
            if (result.outcome === "RECOVERED") {
                recovered += 1;
            }
        }

        return {
            found: expiredDeliveries.length,
            recovered,
            staleClaims: expiredDeliveries.length - recovered
        };
    };
}

function buildRecoveryCommand(
    delivery: ExpiredInboundDelivery,
    recoveredAt: Date,
    random: () => number
): RecoverExpiredInboundDeliveryCommand {
    const baseCommand = {
        attemptId: delivery.attemptId,
        attemptNumber: delivery.attemptNumber,
        deliveryId: delivery.deliveryId,
        errorCode:
            delivery.attemptId === null
                ? ("CLAIM_LEASE_EXPIRED" as const)
                : ("ATTEMPT_LEASE_EXPIRED" as const),
        leaseOwner: delivery.leaseOwner,
        leaseToken: delivery.leaseToken,
        recoveredAt
    };

    if (delivery.attemptId === null) {
        return hasInboundDeliveryDeadlineElapsed(delivery.deliveryReceivedAt, recoveredAt)
            ? { ...baseCommand, targetStatus: "EXHAUSTED" }
            : { ...baseCommand, nextAttemptAt: recoveredAt, targetStatus: "RETRY_WAIT" };
    }

    const decision = decideInboundDeliveryRetry({
        attemptNumber: delivery.attemptNumber,
        completedAt: recoveredAt,
        deliveryReceivedAt: delivery.deliveryReceivedAt,
        randomValue: random()
    });
    return decision.targetStatus === "EXHAUSTED"
        ? { ...baseCommand, targetStatus: "EXHAUSTED" }
        : { ...baseCommand, ...decision };
}
