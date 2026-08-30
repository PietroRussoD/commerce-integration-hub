const MAX_WORKER_ID_LENGTH = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface CompleteDeliveredInboundDeliveryAttemptRequest {
    readonly attemptId: string;
    readonly coreOrderId: string;
    readonly deliveryId: string;
    readonly httpStatus: 200 | 201;
    readonly leaseToken: string;
}

export interface CompleteDeliveredInboundDeliveryAttemptCommand
    extends CompleteDeliveredInboundDeliveryAttemptRequest {
    readonly completedAt: Date;
    readonly workerId: string;
}

export type CompleteDeliveredInboundDeliveryAttemptResult =
    | { readonly outcome: "COMPLETED" }
    | { readonly outcome: "STALE_CLAIM" };

export interface DeliveredInboundDeliveryAttemptRepository {
    completeDelivered(
        command: CompleteDeliveredInboundDeliveryAttemptCommand
    ): Promise<CompleteDeliveredInboundDeliveryAttemptResult>;
}

export interface CompleteDeliveredInboundDeliveryAttemptDependencies {
    readonly currentTimeMilliseconds?: () => number;
    readonly repository: DeliveredInboundDeliveryAttemptRepository;
    readonly workerId: string;
}

export type CompleteDeliveredInboundDeliveryAttemptUseCase = (
    request: CompleteDeliveredInboundDeliveryAttemptRequest
) => Promise<CompleteDeliveredInboundDeliveryAttemptResult>;

export function createCompleteDeliveredInboundDeliveryAttemptUseCase({
    currentTimeMilliseconds = Date.now,
    repository,
    workerId
}: CompleteDeliveredInboundDeliveryAttemptDependencies): CompleteDeliveredInboundDeliveryAttemptUseCase {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
    }

    return (request) => {
        assertUuid(request.attemptId, "attemptId");
        assertUuid(request.coreOrderId, "coreOrderId");
        assertUuid(request.deliveryId, "deliveryId");
        assertUuid(request.leaseToken, "leaseToken");
        if (request.httpStatus !== 200 && request.httpStatus !== 201) {
            throw new Error("httpStatus must be 200 or 201");
        }
        return repository.completeDelivered({
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
