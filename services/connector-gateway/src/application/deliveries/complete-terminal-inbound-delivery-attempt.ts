import type { ForwardCanonicalOrderResult } from "../forwarding/forward-canonical-order.js";

const MAX_ATTEMPTS = 5;
const MAX_WORKER_ID_LENGTH = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type BlockedForwardingResult = Extract<
    ForwardCanonicalOrderResult,
    { outcome: "BLOCKED_CONFIGURATION" }
>;
type PermanentForwardingResult = Extract<
    ForwardCanonicalOrderResult,
    { outcome: "PERMANENT_FAILURE" }
>;

interface CompleteTerminalInboundDeliveryAttemptRequestBase {
    readonly attemptId: string;
    readonly attemptNumber: number;
    readonly deliveryId: string;
    readonly leaseToken: string;
}

export type CompleteTerminalInboundDeliveryAttemptRequest =
    | (CompleteTerminalInboundDeliveryAttemptRequestBase & BlockedForwardingResult)
    | (CompleteTerminalInboundDeliveryAttemptRequestBase & PermanentForwardingResult);

export type CompleteTerminalInboundDeliveryAttemptCommand =
    CompleteTerminalInboundDeliveryAttemptRequest & {
        readonly completedAt: Date;
        readonly workerId: string;
    };

export type CompleteTerminalInboundDeliveryAttemptResult =
    | { readonly outcome: "COMPLETED" }
    | { readonly outcome: "STALE_CLAIM" };

export interface TerminalInboundDeliveryAttemptRepository {
    completeTerminal(
        command: CompleteTerminalInboundDeliveryAttemptCommand
    ): Promise<CompleteTerminalInboundDeliveryAttemptResult>;
}

export interface CompleteTerminalInboundDeliveryAttemptDependencies {
    readonly currentTimeMilliseconds?: () => number;
    readonly repository: TerminalInboundDeliveryAttemptRepository;
    readonly workerId: string;
}

export function createCompleteTerminalInboundDeliveryAttemptUseCase({
    currentTimeMilliseconds = Date.now,
    repository,
    workerId
}: CompleteTerminalInboundDeliveryAttemptDependencies) {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
    }

    return (request: CompleteTerminalInboundDeliveryAttemptRequest) => {
        assertUuid(request.attemptId, "attemptId");
        assertUuid(request.deliveryId, "deliveryId");
        assertUuid(request.leaseToken, "leaseToken");
        if (
            !Number.isInteger(request.attemptNumber) ||
            request.attemptNumber < 1 ||
            request.attemptNumber > MAX_ATTEMPTS
        ) {
            throw new Error(`attemptNumber must be an integer between 1 and ${MAX_ATTEMPTS}`);
        }
        if (
            request.outcome === "BLOCKED_CONFIGURATION" &&
            request.httpStatus !== 401 &&
            request.httpStatus !== 403
        ) {
            throw new Error("blocked configuration httpStatus must be 401 or 403");
        }
        if (
            request.outcome === "PERMANENT_FAILURE" &&
            request.httpStatus !== 400 &&
            request.httpStatus !== 404 &&
            request.httpStatus !== 409 &&
            request.httpStatus !== 422
        ) {
            throw new Error("permanent failure httpStatus must be 400, 404, 409, or 422");
        }
        return repository.completeTerminal({
            ...request,
            completedAt: new Date(currentTimeMilliseconds()),
            workerId
        });
    };
}

function assertUuid(value: string, name: string): void {
    if (!UUID_PATTERN.test(value)) {
        throw new Error(`${name} must be a canonical UUID`);
    }
}
