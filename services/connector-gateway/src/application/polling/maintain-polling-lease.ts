const MAX_LEASE_DURATION_MILLISECONDS = 300_000;
const MAX_WORKER_ID_LENGTH = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PollingLeaseIdentity {
    readonly connectorId: string;
    readonly leaseToken: string;
}

export interface RenewPollingLeaseCommand extends PollingLeaseIdentity {
    readonly leaseExpiresAt: Date;
    readonly renewedAt: Date;
    readonly workerId: string;
}

export interface ReleasePollingLeaseCommand extends PollingLeaseIdentity {
    readonly releasedAt: Date;
    readonly workerId: string;
}

export interface RenewedPollingLease {
    readonly leaseExpiresAt: Date;
}

export interface PollingLeaseMaintenanceRepository {
    release(command: ReleasePollingLeaseCommand): Promise<boolean>;
    renew(command: RenewPollingLeaseCommand): Promise<RenewedPollingLease | null>;
}

interface PollingLeaseMaintenanceDependencies {
    readonly currentTimeMilliseconds?: () => number;
    readonly repository: PollingLeaseMaintenanceRepository;
    readonly workerId: string;
}

export interface RenewPollingLeaseDependencies extends PollingLeaseMaintenanceDependencies {
    readonly leaseDurationMilliseconds: number;
}

export type RenewPollingLeaseUseCase = (
    identity: PollingLeaseIdentity
) => Promise<RenewedPollingLease | null>;

export type ReleasePollingLeaseUseCase = (identity: PollingLeaseIdentity) => Promise<boolean>;

export function createRenewPollingLeaseUseCase({
    currentTimeMilliseconds = Date.now,
    leaseDurationMilliseconds,
    repository,
    workerId
}: RenewPollingLeaseDependencies): RenewPollingLeaseUseCase {
    assertWorkerId(workerId);
    if (
        !Number.isSafeInteger(leaseDurationMilliseconds) ||
        leaseDurationMilliseconds < 1 ||
        leaseDurationMilliseconds > MAX_LEASE_DURATION_MILLISECONDS
    ) {
        throw new Error(
            `leaseDurationMilliseconds must be an integer between 1 and ${MAX_LEASE_DURATION_MILLISECONDS}`
        );
    }

    return (identity) => {
        assertIdentity(identity);
        const renewedAtMilliseconds = currentTimeMilliseconds();
        return repository.renew({
            ...identity,
            leaseExpiresAt: new Date(renewedAtMilliseconds + leaseDurationMilliseconds),
            renewedAt: new Date(renewedAtMilliseconds),
            workerId
        });
    };
}

export function createReleasePollingLeaseUseCase({
    currentTimeMilliseconds = Date.now,
    repository,
    workerId
}: PollingLeaseMaintenanceDependencies): ReleasePollingLeaseUseCase {
    assertWorkerId(workerId);

    return (identity) => {
        assertIdentity(identity);
        return repository.release({
            ...identity,
            releasedAt: new Date(currentTimeMilliseconds()),
            workerId
        });
    };
}

function assertIdentity(identity: PollingLeaseIdentity): void {
    if (!UUID_PATTERN.test(identity.connectorId)) {
        throw new Error("connectorId must be a canonical UUID");
    }
    if (!UUID_PATTERN.test(identity.leaseToken)) {
        throw new Error("leaseToken must be a canonical UUID");
    }
}

function assertWorkerId(workerId: string): void {
    if (workerId.trim().length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(`workerId must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`);
    }
}
