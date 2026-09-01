import { describe, expect, it, vi } from "vitest";

import {
    createReleasePollingLeaseUseCase,
    createRenewPollingLeaseUseCase,
    type PollingLeaseMaintenanceRepository,
    type RenewPollingLeaseDependencies
} from "./maintain-polling-lease.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000401";
const IDENTITY = { connectorId: CONNECTOR_ID, leaseToken: LEASE_TOKEN };

describe("polling lease maintenance", () => {
    it("builds a bounded renewal command", async () => {
        const renewRepository = vi.fn().mockResolvedValue(null);
        const repository = { ...repositoryStub(), renew: renewRepository };
        const renew = createRenewUseCase({ repository });

        await expect(renew(IDENTITY)).resolves.toBeNull();
        expect(renewRepository).toHaveBeenCalledWith({
            ...IDENTITY,
            leaseExpiresAt: new Date("2026-09-01T09:01:30.000Z"),
            renewedAt: new Date("2026-09-01T09:00:30.000Z"),
            workerId: "poller-a"
        });
    });

    it("builds a fenced release command", async () => {
        const releaseRepository = vi.fn().mockResolvedValue(false);
        const repository = { ...repositoryStub(), release: releaseRepository };
        const release = createReleasePollingLeaseUseCase({
            currentTimeMilliseconds,
            repository,
            workerId: "poller-a"
        });

        await expect(release(IDENTITY)).resolves.toBe(false);
        expect(releaseRepository).toHaveBeenCalledWith({
            ...IDENTITY,
            releasedAt: new Date("2026-09-01T09:00:30.000Z"),
            workerId: "poller-a"
        });
    });

    it.each([0, -1, 300_001, 1.5, Number.NaN])(
        "rejects invalid renewal duration %s",
        (leaseDurationMilliseconds) => {
            expect(() => createRenewUseCase({ leaseDurationMilliseconds })).toThrow(
                "leaseDurationMilliseconds must be an integer between 1 and 300000"
            );
        }
    );

    it.each(["", " ", "a".repeat(101)])(
        "rejects invalid maintenance worker ID %j",
        (workerId) => {
            expect(() => createRenewUseCase({ workerId })).toThrow(
                "workerId must contain between 1 and 100 characters"
            );
            expect(() =>
                createReleasePollingLeaseUseCase({
                    currentTimeMilliseconds,
                    repository: repositoryStub(),
                    workerId
                })
            ).toThrow("workerId must contain between 1 and 100 characters");
        }
    );

    it.each([
        ["connectorId", "erp-b", "connectorId must be a canonical UUID"],
        ["leaseToken", "stale-token", "leaseToken must be a canonical UUID"]
    ] as const)("rejects an invalid %s", (field, value, message) => {
        const identity = { ...IDENTITY, [field]: value };
        const renew = createRenewUseCase();
        const release = createReleasePollingLeaseUseCase({
            currentTimeMilliseconds,
            repository: repositoryStub(),
            workerId: "poller-a"
        });

        expect(() => renew(identity)).toThrow(message);
        expect(() => release(identity)).toThrow(message);
    });
});

function createRenewUseCase(
    overrides: Partial<RenewPollingLeaseDependencies> = {}
): ReturnType<typeof createRenewPollingLeaseUseCase> {
    return createRenewPollingLeaseUseCase({
        currentTimeMilliseconds,
        leaseDurationMilliseconds: 60_000,
        repository: repositoryStub(),
        workerId: "poller-a",
        ...overrides
    });
}

function currentTimeMilliseconds(): number {
    return Date.parse("2026-09-01T09:00:30.000Z");
}

function repositoryStub(): PollingLeaseMaintenanceRepository {
    return {
        release: vi.fn().mockResolvedValue(false),
        renew: vi.fn().mockResolvedValue(null)
    };
}
