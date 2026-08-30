const BASE_RETRY_DELAYS_MILLISECONDS = [5_000, 30_000, 120_000, 600_000] as const;
const MAX_ATTEMPTS = 5;
const MAX_DELIVERY_AGE_MILLISECONDS = 86_400_000;
const MAX_RETRY_AFTER_MILLISECONDS = 900_000;

export type InboundDeliveryRetryDecision =
    | { readonly nextAttemptAt: Date; readonly targetStatus: "RETRY_WAIT" }
    | { readonly targetStatus: "EXHAUSTED" };

export interface DecideInboundDeliveryRetryRequest {
    readonly attemptNumber: number;
    readonly completedAt: Date;
    readonly deliveryReceivedAt: Date;
    readonly randomValue: number;
    readonly retryAfterMilliseconds?: number | undefined;
}

export function decideInboundDeliveryRetry({
    attemptNumber,
    completedAt,
    deliveryReceivedAt,
    randomValue,
    retryAfterMilliseconds
}: DecideInboundDeliveryRetryRequest): InboundDeliveryRetryDecision {
    validateAttemptNumber(attemptNumber);
    validateDate(completedAt, "completedAt");
    validateDate(deliveryReceivedAt, "deliveryReceivedAt");
    validateRandomValue(randomValue);
    validateRetryAfter(retryAfterMilliseconds);

    const completedAtMilliseconds = completedAt.getTime();
    const deliveryDeadline = deliveryReceivedAt.getTime() + MAX_DELIVERY_AGE_MILLISECONDS;

    if (attemptNumber >= MAX_ATTEMPTS || completedAtMilliseconds >= deliveryDeadline) {
        return { targetStatus: "EXHAUSTED" };
    }

    const baseDelay = BASE_RETRY_DELAYS_MILLISECONDS[attemptNumber - 1]!;
    const minimumJitteredDelay = Math.ceil(baseDelay / 2);
    const jitteredDelay =
        minimumJitteredDelay +
        Math.floor(randomValue * (baseDelay - minimumJitteredDelay + 1));
    const delay = Math.max(jitteredDelay, retryAfterMilliseconds ?? 0);
    const nextAttemptAtMilliseconds = completedAtMilliseconds + delay;

    return nextAttemptAtMilliseconds >= deliveryDeadline
        ? { targetStatus: "EXHAUSTED" }
        : {
              nextAttemptAt: new Date(nextAttemptAtMilliseconds),
              targetStatus: "RETRY_WAIT"
          };
}

export function hasInboundDeliveryDeadlineElapsed(
    deliveryReceivedAt: Date,
    evaluatedAt: Date
): boolean {
    validateDate(deliveryReceivedAt, "deliveryReceivedAt");
    validateDate(evaluatedAt, "evaluatedAt");
    return evaluatedAt.getTime() >= deliveryReceivedAt.getTime() + MAX_DELIVERY_AGE_MILLISECONDS;
}

function validateAttemptNumber(attemptNumber: number): void {
    if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > MAX_ATTEMPTS) {
        throw new Error(`attemptNumber must be an integer between 1 and ${MAX_ATTEMPTS}`);
    }
}

function validateDate(value: Date, name: string): void {
    if (!Number.isFinite(value.getTime())) {
        throw new Error(`${name} must be a valid date`);
    }
}

function validateRandomValue(randomValue: number): void {
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
        throw new Error("random must return a finite number between 0 inclusive and 1 exclusive");
    }
}

function validateRetryAfter(retryAfterMilliseconds: number | undefined): void {
    if (
        retryAfterMilliseconds !== undefined &&
        (!Number.isInteger(retryAfterMilliseconds) ||
            retryAfterMilliseconds < 0 ||
            retryAfterMilliseconds > MAX_RETRY_AFTER_MILLISECONDS)
    ) {
        throw new Error(
            `retryAfterMilliseconds must be an integer between 0 and ${MAX_RETRY_AFTER_MILLISECONDS}`
        );
    }
}
