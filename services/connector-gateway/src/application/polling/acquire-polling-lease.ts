const MAX_LEASE_DURATION_MILLISECONDS = 300_000;
const MAX_WORKER_ID_LENGTH = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AcquirePollingLeaseCommand {
    readonly acquiredAt: Date;
    readonly connectorId: string;
    readonly leaseExpiresAt: Date;
    readonly leaseToken: string;
    readonly workerId: string;
}

export interface AcquiredPollingLease {
    readonly checkpointVersion: number;
    readonly connectorId: string;
    readonly cursor: string | null;
    readonly leaseExpiresAt: Date;
    readonly leaseToken: string;
}

export interface PollingLeaseRepository {
    tryAcquire(command: AcquirePollingLeaseCommand): Promise<AcquiredPollingLease | null>;
}

export interface AcquirePollingLeaseDependencies {
    readonly createLeaseToken: () => string;
    readonly currentTimeMilliseconds?: () => number;
    readonly leaseDurationMilliseconds: number;
    readonly repository: PollingLeaseRepository;
    readonly workerId: string;
}

export type AcquirePollingLeaseUseCase = (
    connectorId: string
) => Promise<AcquiredPollingLease | null>;

export function createAcquirePollingLeaseUseCase({
    createLeaseToken,
    currentTimeMilliseconds = Date.now,
    leaseDurationMilliseconds,
    repository,
    workerId
}: AcquirePollingLeaseDependencies): AcquirePollingLeaseUseCase {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
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

    return (connectorId) => {
        if (!UUID_PATTERN.test(connectorId)) {
            throw new Error("connectorId must be a canonical UUID");
        }

        const acquiredAtMilliseconds = currentTimeMilliseconds();
        const leaseToken = createLeaseToken();
        if (!UUID_PATTERN.test(leaseToken)) {
            throw new Error("createLeaseToken must return a canonical UUID");
        }

        return repository.tryAcquire({
            acquiredAt: new Date(acquiredAtMilliseconds),
            connectorId,
            leaseExpiresAt: new Date(acquiredAtMilliseconds + leaseDurationMilliseconds),
            leaseToken,
            workerId
        });
    };
}
