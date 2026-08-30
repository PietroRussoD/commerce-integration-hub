const MAX_WORKER_ID_LENGTH = 100;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface StartInboundDeliveryAttemptRequest {
    readonly deliveryId: string;
    readonly leaseToken: string;
    readonly traceId?: string;
}

export interface StartInboundDeliveryAttemptCommand extends StartInboundDeliveryAttemptRequest {
    readonly attemptId: string;
    readonly startedAt: Date;
    readonly workerId: string;
}

export type StartInboundDeliveryAttemptResult =
    | {
          readonly attemptId: string;
          readonly attemptNumber: number;
          readonly outcome: "STARTED";
          readonly startedAt: Date;
      }
    | { readonly outcome: "STALE_CLAIM" };

export interface InboundDeliveryAttemptRepository {
    start(
        command: StartInboundDeliveryAttemptCommand
    ): Promise<StartInboundDeliveryAttemptResult>;
}

export interface StartInboundDeliveryAttemptDependencies {
    readonly createAttemptId: () => string;
    readonly currentTimeMilliseconds?: () => number;
    readonly repository: InboundDeliveryAttemptRepository;
    readonly workerId: string;
}

export type StartInboundDeliveryAttemptUseCase = (
    request: StartInboundDeliveryAttemptRequest
) => Promise<StartInboundDeliveryAttemptResult>;

export function createStartInboundDeliveryAttemptUseCase({
    createAttemptId,
    currentTimeMilliseconds = Date.now,
    repository,
    workerId
}: StartInboundDeliveryAttemptDependencies): StartInboundDeliveryAttemptUseCase {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
    }

    return (request) => {
        assertUuid(request.deliveryId, "deliveryId");
        assertUuid(request.leaseToken, "leaseToken");
        if (request.traceId !== undefined && !TRACE_ID_PATTERN.test(request.traceId)) {
            throw new Error("traceId must be 32 lower-case hexadecimal characters");
        }

        const attemptId = createAttemptId();
        assertUuid(attemptId, "createAttemptId result");
        return repository.start({
            attemptId,
            deliveryId: request.deliveryId,
            leaseToken: request.leaseToken,
            startedAt: new Date(currentTimeMilliseconds()),
            ...(request.traceId === undefined ? {} : { traceId: request.traceId }),
            workerId
        });
    };
}

function assertUuid(value: string, name: string): void {
    if (!UUID_PATTERN.test(value)) {
        throw new Error(`${name} must be a canonical UUID`);
    }
}
