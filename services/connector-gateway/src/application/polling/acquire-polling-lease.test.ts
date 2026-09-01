import { describe, expect, it, vi } from "vitest";

import {
    createAcquirePollingLeaseUseCase,
    type AcquirePollingLeaseDependencies
} from "./acquire-polling-lease.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000401";

describe("createAcquirePollingLeaseUseCase", () => {
    it("builds a bounded lease acquisition command", async () => {
        const tryAcquire = vi.fn().mockResolvedValue(null);
        const acquire = createUseCase({ repository: { tryAcquire } });

        await expect(acquire(CONNECTOR_ID)).resolves.toBeNull();
        expect(tryAcquire).toHaveBeenCalledWith({
            acquiredAt: new Date("2026-09-01T09:00:00.000Z"),
            connectorId: CONNECTOR_ID,
            leaseExpiresAt: new Date("2026-09-01T09:01:00.000Z"),
            leaseToken: LEASE_TOKEN,
            workerId: "poller-a"
        });
    });

    it.each([0, -1, 300_001, 1.5, Number.NaN])(
        "rejects invalid lease duration %s",
        (leaseDurationMilliseconds) => {
            expect(() => createUseCase({ leaseDurationMilliseconds })).toThrow(
                "leaseDurationMilliseconds must be an integer between 1 and 300000"
            );
        }
    );

    it.each(["", " ", "a".repeat(101)])("rejects invalid worker ID %j", (workerId) => {
        expect(() => createUseCase({ workerId })).toThrow(
            "workerId must contain between 1 and 100 characters"
        );
    });

    it("rejects a non-UUID connector ID", () => {
        const acquire = createUseCase();

        expect(() => acquire("erp-b")).toThrow("connectorId must be a canonical UUID");
    });

    it("rejects a non-UUID lease token", () => {
        const acquire = createUseCase({ createLeaseToken: () => "not-a-uuid" });

        expect(() => acquire(CONNECTOR_ID)).toThrow(
            "createLeaseToken must return a canonical UUID"
        );
    });
});

function createUseCase(
    overrides: Partial<AcquirePollingLeaseDependencies> = {}
): ReturnType<typeof createAcquirePollingLeaseUseCase> {
    return createAcquirePollingLeaseUseCase({
        createLeaseToken: () => LEASE_TOKEN,
        currentTimeMilliseconds: () => Date.parse("2026-09-01T09:00:00.000Z"),
        leaseDurationMilliseconds: 60_000,
        repository: { tryAcquire: () => Promise.resolve(null) },
        workerId: "poller-a",
        ...overrides
    });
}
