import type { PollingLeaseIdentity } from "./maintain-polling-lease.js";

const MAX_WORKER_ID_LENGTH = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface BlockPollingConnectorCommand extends PollingLeaseIdentity {
    readonly blockedAt: Date;
    readonly workerId: string;
}

export interface PollingConnectorRepository {
    blockConfiguration(command: BlockPollingConnectorCommand): Promise<boolean>;
}

export interface BlockPollingConnectorDependencies {
    readonly currentTimeMilliseconds?: () => number;
    readonly repository: PollingConnectorRepository;
    readonly workerId: string;
}

export type BlockPollingConnectorUseCase = (
    identity: PollingLeaseIdentity
) => Promise<boolean>;

export function createBlockPollingConnectorUseCase({
    currentTimeMilliseconds = Date.now,
    repository,
    workerId
}: BlockPollingConnectorDependencies): BlockPollingConnectorUseCase {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
    }

    return (identity) => {
        if (!UUID_PATTERN.test(identity.connectorId)) {
            throw new Error("connectorId must be a canonical UUID");
        }
        if (!UUID_PATTERN.test(identity.leaseToken)) {
            throw new Error("leaseToken must be a canonical UUID");
        }
        return repository.blockConfiguration({
            ...identity,
            blockedAt: new Date(currentTimeMilliseconds()),
            workerId
        });
    };
}
