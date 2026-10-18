const MAX_BATCH_SIZE = 100;

export interface InboundDeliveryPayloadRetentionRepository {
    clearExpiredTerminalPayloads(limit: number): Promise<number>;
}

export interface ClearExpiredInboundDeliveryPayloadsDependencies {
    readonly batchSize: number;
    readonly repository: InboundDeliveryPayloadRetentionRepository;
}

export function createClearExpiredInboundDeliveryPayloadsUseCase({
    batchSize,
    repository
}: ClearExpiredInboundDeliveryPayloadsDependencies) {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
        throw new Error(`batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}`);
    }

    // The database owns eligibility time; callers cannot advance expiry using an
    // application clock. Each invocation performs exactly one bounded batch.
    return async (): Promise<number> => repository.clearExpiredTerminalPayloads(batchSize);
}
