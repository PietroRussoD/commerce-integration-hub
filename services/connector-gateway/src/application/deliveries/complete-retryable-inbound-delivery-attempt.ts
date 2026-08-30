import type { ForwardCanonicalOrderResult } from "../forwarding/forward-canonical-order.js";
import { decideInboundDeliveryRetry } from "./inbound-delivery-retry-policy.js";

const MAX_WORKER_ID_LENGTH = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type RetryableForwardingResult = Extract<
    ForwardCanonicalOrderResult,
    { outcome: "RETRYABLE_FAILURE" }
>;

export interface CompleteRetryableInboundDeliveryAttemptRequest {
    readonly attemptId: string;
    readonly attemptNumber: number;
    readonly deliveryId: string;
    readonly deliveryReceivedAt: Date;
    readonly errorCode: RetryableForwardingResult["errorCode"];
    readonly httpStatus?: number;
    readonly leaseToken: string;
    readonly retryAfterMilliseconds?: number;
}

interface CompleteRetryableInboundDeliveryAttemptCommandBase
    extends CompleteRetryableInboundDeliveryAttemptRequest {
    readonly completedAt: Date;
    readonly workerId: string;
}

export type CompleteRetryableInboundDeliveryAttemptCommand =
    | (CompleteRetryableInboundDeliveryAttemptCommandBase & {
          readonly nextAttemptAt: Date;
          readonly targetStatus: "RETRY_WAIT";
      })
    | (CompleteRetryableInboundDeliveryAttemptCommandBase & {
          readonly targetStatus: "EXHAUSTED";
      });

export type CompleteRetryableInboundDeliveryAttemptResult =
    | { readonly outcome: "COMPLETED" }
    | { readonly outcome: "STALE_CLAIM" };

export interface RetryableInboundDeliveryAttemptRepository {
    completeRetryable(
        command: CompleteRetryableInboundDeliveryAttemptCommand
    ): Promise<CompleteRetryableInboundDeliveryAttemptResult>;
}

export interface CompleteRetryableInboundDeliveryAttemptDependencies {
    readonly currentTimeMilliseconds?: () => number;
    readonly random?: () => number;
    readonly repository: RetryableInboundDeliveryAttemptRepository;
    readonly workerId: string;
}

export function createCompleteRetryableInboundDeliveryAttemptUseCase({
    currentTimeMilliseconds = Date.now,
    random = Math.random,
    repository,
    workerId
}: CompleteRetryableInboundDeliveryAttemptDependencies) {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
    }

    return (request: CompleteRetryableInboundDeliveryAttemptRequest) => {
        validateRequest(request);
        const completedAtMilliseconds = currentTimeMilliseconds();
        const completedAt = new Date(completedAtMilliseconds);
        const decision = decideInboundDeliveryRetry({
            attemptNumber: request.attemptNumber,
            completedAt,
            deliveryReceivedAt: request.deliveryReceivedAt,
            randomValue: random(),
            retryAfterMilliseconds: request.retryAfterMilliseconds
        });

        return repository.completeRetryable(
            decision.targetStatus === "EXHAUSTED"
                ? { ...request, completedAt, targetStatus: "EXHAUSTED", workerId }
                : { ...request, completedAt, ...decision, workerId }
        );
    };
}

function validateRequest(request: CompleteRetryableInboundDeliveryAttemptRequest): void {
    assertUuid(request.attemptId, "attemptId");
    assertUuid(request.deliveryId, "deliveryId");
    assertUuid(request.leaseToken, "leaseToken");
    if (
        request.httpStatus !== undefined &&
        (!Number.isInteger(request.httpStatus) || request.httpStatus < 100 || request.httpStatus > 599)
    ) {
        throw new Error("httpStatus must be an integer between 100 and 599");
    }
}

function assertUuid(value: string, name: string): void {
    if (!UUID_PATTERN.test(value)) {
        throw new Error(`${name} must be a canonical UUID`);
    }
}
