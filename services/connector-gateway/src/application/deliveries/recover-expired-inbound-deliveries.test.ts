import { describe, expect, it, vi } from "vitest";

import {
    createRecoverExpiredInboundDeliveriesUseCase,
    type ExpiredInboundDelivery,
    type ExpiredInboundDeliveryRepository
} from "./recover-expired-inbound-deliveries.js";

const RECOVERED_AT = new Date("2026-08-30T09:00:00.000Z");
const EXPIRED_DELIVERY: ExpiredInboundDelivery = {
    attemptId: null,
    attemptNumber: 0,
    deliveryId: "0199037b-6400-7000-8000-000000000751",
    deliveryReceivedAt: new Date("2026-08-30T08:00:00.000Z"),
    leaseOwner: "gateway-worker-1",
    leaseToken: "0199037b-6400-7000-8000-000000000752"
};

describe("createRecoverExpiredInboundDeliveriesUseCase", () => {
    it("returns a pre-attempt claim to the eligible queue without incrementing attempts", async () => {
        const repository = createRepository([EXPIRED_DELIVERY]);

        await expect(createUseCase(repository)()).resolves.toEqual({
            found: 1,
            recovered: 1,
            staleClaims: 0
        });
        expect(repository.findExpired).toHaveBeenCalledWith({
            expiredAt: RECOVERED_AT,
            limit: 10
        });
        expect(repository.recoverExpired).toHaveBeenCalledWith({
            attemptId: null,
            attemptNumber: 0,
            deliveryId: EXPIRED_DELIVERY.deliveryId,
            errorCode: "CLAIM_LEASE_EXPIRED",
            leaseOwner: "gateway-worker-1",
            leaseToken: EXPIRED_DELIVERY.leaseToken,
            nextAttemptAt: RECOVERED_AT,
            recoveredAt: RECOVERED_AT,
            targetStatus: "RETRY_WAIT"
        });
    });

    it("closes an open attempt and applies the shared retry policy", async () => {
        const repository = createRepository([
            {
                ...EXPIRED_DELIVERY,
                attemptId: "0199037b-6400-7000-8000-000000000753",
                attemptNumber: 1
            }
        ]);

        await createUseCase(repository, () => 0)();

        expect(repository.recoverExpired).toHaveBeenCalledWith(
            expect.objectContaining({
                attemptId: "0199037b-6400-7000-8000-000000000753",
                errorCode: "ATTEMPT_LEASE_EXPIRED",
                nextAttemptAt: new Date("2026-08-30T09:00:02.500Z"),
                targetStatus: "RETRY_WAIT"
            })
        );
    });

    it.each([
        { ...EXPIRED_DELIVERY, deliveryReceivedAt: new Date("2026-08-29T09:00:00.000Z") },
        {
            ...EXPIRED_DELIVERY,
            attemptId: "0199037b-6400-7000-8000-000000000753",
            attemptNumber: 5
        }
    ])("exhausts an expired delivery at a policy bound", async (delivery) => {
        const repository = createRepository([delivery]);

        await createUseCase(repository)();

        expect(repository.recoverExpired).toHaveBeenCalledWith(
            expect.objectContaining({ targetStatus: "EXHAUSTED" })
        );
    });

    it("counts claims concurrently recovered by another worker", async () => {
        const repository = createRepository([EXPIRED_DELIVERY]);
        vi.mocked(repository.recoverExpired).mockResolvedValue({ outcome: "STALE_CLAIM" });

        await expect(createUseCase(repository)()).resolves.toEqual({
            found: 1,
            recovered: 0,
            staleClaims: 1
        });
    });

    it("returns zero counts when no expired delivery exists", async () => {
        const repository = createRepository([]);

        await expect(createUseCase(repository)()).resolves.toEqual({
            found: 0,
            recovered: 0,
            staleClaims: 0
        });
        expect(repository.recoverExpired).not.toHaveBeenCalled();
    });

    it.each([0, 101, 1.5])("rejects batch size %s", (batchSize) => {
        expect(() => createUseCase(createRepository([]), Math.random, batchSize)).toThrow(
            "batchSize must be an integer between 1 and 100"
        );
    });
});

function createRepository(expired: readonly ExpiredInboundDelivery[]) {
    return {
        findExpired: vi
            .fn<ExpiredInboundDeliveryRepository["findExpired"]>()
            .mockResolvedValue(expired),
        recoverExpired: vi
            .fn<ExpiredInboundDeliveryRepository["recoverExpired"]>()
            .mockResolvedValue({ outcome: "RECOVERED" })
    };
}

function createUseCase(
    repository: ExpiredInboundDeliveryRepository,
    random: () => number = () => 0.5,
    batchSize = 10
) {
    return createRecoverExpiredInboundDeliveriesUseCase({
        batchSize,
        currentTimeMilliseconds: () => RECOVERED_AT.getTime(),
        random,
        repository
    });
}
