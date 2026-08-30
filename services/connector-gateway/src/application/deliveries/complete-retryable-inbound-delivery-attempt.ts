import type { ForwardCanonicalOrderResult } from "../forwarding/forward-canonical-order.js";

const BASE_RETRY_DELAYS_MILLISECONDS = [5_000, 30_000, 120_000, 600_000] as const;
const MAX_ATTEMPTS = 5;
const MAX_DELIVERY_AGE_MILLISECONDS = 86_400_000;
const MAX_RETRY_AFTER_MILLISECONDS = 900_000;
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
        const deliveryDeadline =
            request.deliveryReceivedAt.getTime() + MAX_DELIVERY_AGE_MILLISECONDS;

        if (request.attemptNumber >= MAX_ATTEMPTS || completedAtMilliseconds >= deliveryDeadline) {
            return repository.completeRetryable({
                ...request,
                completedAt,
                targetStatus: "EXHAUSTED",
                workerId
            });
        }

        const randomValue = random();
        if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
            throw new Error("random must return a finite number between 0 inclusive and 1 exclusive");
        }
        const delayIndex = (request.attemptNumber - 1) as 0 | 1 | 2 | 3;
        const baseDelay = BASE_RETRY_DELAYS_MILLISECONDS[delayIndex];
        const minimumJitteredDelay = Math.ceil(baseDelay / 2);
        const jitteredDelay =
            minimumJitteredDelay +
            Math.floor(randomValue * (baseDelay - minimumJitteredDelay + 1));
        const delay = Math.max(jitteredDelay, request.retryAfterMilliseconds ?? 0);
        const nextAttemptAtMilliseconds = completedAtMilliseconds + delay;

        return repository.completeRetryable(
            nextAttemptAtMilliseconds >= deliveryDeadline
                ? {
                      ...request,
                      completedAt,
                      targetStatus: "EXHAUSTED",
                      workerId
                  }
                : {
                      ...request,
                      completedAt,
                      nextAttemptAt: new Date(nextAttemptAtMilliseconds),
                      targetStatus: "RETRY_WAIT",
                      workerId
                  }
        );
    };
}

function validateRequest(request: CompleteRetryableInboundDeliveryAttemptRequest): void {
    assertUuid(request.attemptId, "attemptId");
    assertUuid(request.deliveryId, "deliveryId");
    assertUuid(request.leaseToken, "leaseToken");
    if (!Number.isInteger(request.attemptNumber) || request.attemptNumber < 1 || request.attemptNumber > MAX_ATTEMPTS) {
        throw new Error(`attemptNumber must be an integer between 1 and ${MAX_ATTEMPTS}`);
    }
    if (!Number.isFinite(request.deliveryReceivedAt.getTime())) {
        throw new Error("deliveryReceivedAt must be a valid date");
    }
    if (
        request.httpStatus !== undefined &&
        (!Number.isInteger(request.httpStatus) || request.httpStatus < 100 || request.httpStatus > 599)
    ) {
        throw new Error("httpStatus must be an integer between 100 and 599");
    }
    if (
        request.retryAfterMilliseconds !== undefined &&
        (!Number.isInteger(request.retryAfterMilliseconds) ||
            request.retryAfterMilliseconds < 0 ||
            request.retryAfterMilliseconds > MAX_RETRY_AFTER_MILLISECONDS)
    ) {
        throw new Error(
            `retryAfterMilliseconds must be an integer between 0 and ${MAX_RETRY_AFTER_MILLISECONDS}`
        );
    }
}

function assertUuid(value: string, name: string): void {
    if (!UUID_PATTERN.test(value)) {
        throw new Error(`${name} must be a canonical UUID`);
    }
}
