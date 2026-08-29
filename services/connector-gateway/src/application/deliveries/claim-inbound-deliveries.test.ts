import { describe, expect, it, vi } from "vitest";

import {
    createClaimInboundDeliveriesUseCase,
    type InboundDeliveryClaimRepository
} from "./claim-inbound-deliveries.js";

describe("createClaimInboundDeliveriesUseCase", () => {
    it("builds a bounded claim from operational configuration", async () => {
        const claimEligible = vi.fn().mockResolvedValue([]);
        const repository: InboundDeliveryClaimRepository = {
            claimEligible
        };
        const claim = createClaimInboundDeliveriesUseCase({
            batchSize: 5,
            createLeaseToken: () => "0199037b-6400-7000-8000-000000000401",
            currentTimeMilliseconds: () => 1_788_026_400_000,
            leaseDurationMilliseconds: 30_000,
            repository,
            workerId: "gateway-worker-1"
        });

        await expect(claim()).resolves.toEqual([]);
        expect(claimEligible).toHaveBeenCalledWith({
            claimedAt: new Date("2026-08-29T18:00:00.000Z"),
            leaseExpiresAt: new Date("2026-08-29T18:00:30.000Z"),
            leaseToken: "0199037b-6400-7000-8000-000000000401",
            limit: 5,
            workerId: "gateway-worker-1"
        });
    });

    it.each(["", " ", "w".repeat(101)])("rejects invalid worker ID", (workerId) => {
        expect(() => createUseCase({ workerId })).toThrow(
            "workerId must contain between 1 and 100 characters"
        );
    });

    it.each([0, 101, 1.5])("rejects invalid batch size %s", (batchSize) => {
        expect(() => createUseCase({ batchSize })).toThrow(
            "batchSize must be an integer between 1 and 100"
        );
    });

    it.each([0, 300_001, 1.5])(
        "rejects invalid lease duration %s",
        (leaseDurationMilliseconds) => {
        expect(() => createUseCase({ leaseDurationMilliseconds })).toThrow(
            "leaseDurationMilliseconds must be an integer between 1 and 300000"
        );
        }
    );

    it("rejects a non-UUID lease token", () => {
        const claim = createUseCase({ createLeaseToken: () => "not-a-uuid" });

        expect(() => claim()).toThrow("createLeaseToken must return a canonical UUID");
    });
});

function createUseCase(
    overrides: Partial<Parameters<typeof createClaimInboundDeliveriesUseCase>[0]>
) {
    return createClaimInboundDeliveriesUseCase({
        batchSize: 5,
        createLeaseToken: () => "0199037b-6400-7000-8000-000000000401",
        leaseDurationMilliseconds: 30_000,
        repository: { claimEligible: () => Promise.resolve([]) },
        workerId: "gateway-worker-1",
        ...overrides
    });
}
