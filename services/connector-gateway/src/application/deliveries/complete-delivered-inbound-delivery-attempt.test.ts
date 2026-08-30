import { describe, expect, it, vi } from "vitest";

import {
    createCompleteDeliveredInboundDeliveryAttemptUseCase,
    type DeliveredInboundDeliveryAttemptRepository
} from "./complete-delivered-inbound-delivery-attempt.js";

const REQUEST = {
    attemptId: "0199037b-6400-7000-8000-000000000731",
    coreOrderId: "0199037b-6400-7000-8000-000000000732",
    deliveryId: "0199037b-6400-7000-8000-000000000733",
    httpStatus: 201 as const,
    leaseToken: "0199037b-6400-7000-8000-000000000734"
};

describe("createCompleteDeliveredInboundDeliveryAttemptUseCase", () => {
    it("completes a delivered attempt with operational metadata", async () => {
        const completeDelivered = vi
            .fn<DeliveredInboundDeliveryAttemptRepository["completeDelivered"]>()
            .mockResolvedValue({ outcome: "COMPLETED" });
        const useCase = createUseCase({ repository: { completeDelivered } });

        await expect(useCase(REQUEST)).resolves.toEqual({ outcome: "COMPLETED" });
        expect(completeDelivered).toHaveBeenCalledWith({
            ...REQUEST,
            completedAt: new Date("2026-08-30T10:00:00.125Z"),
            workerId: "gateway-worker-1"
        });
    });

    it("preserves a stale-claim result", async () => {
        const useCase = createUseCase({
            repository: {
                completeDelivered: () => Promise.resolve({ outcome: "STALE_CLAIM" })
            }
        });

        await expect(useCase(REQUEST)).resolves.toEqual({ outcome: "STALE_CLAIM" });
    });

    it.each(["", " ", "w".repeat(101)])("rejects invalid worker ID", (workerId) => {
        expect(() => createUseCase({ workerId })).toThrow(
            "workerId must contain between 1 and 100 characters"
        );
    });

    it.each(["attemptId", "coreOrderId", "deliveryId", "leaseToken"] as const)(
        "rejects invalid %s",
        (name) => {
            const useCase = createUseCase();

            expect(() => useCase({ ...REQUEST, [name]: "not-a-uuid" })).toThrow(
                `${name} must be a canonical UUID`
            );
        }
    );

    it.each([199, 202])("rejects HTTP status %s", (httpStatus) => {
        const useCase = createUseCase();

        expect(() => useCase({ ...REQUEST, httpStatus: httpStatus as 200 })).toThrow(
            "httpStatus must be 200 or 201"
        );
    });
});

function createUseCase(
    overrides: Partial<
        Parameters<typeof createCompleteDeliveredInboundDeliveryAttemptUseCase>[0]
    > = {}
) {
    return createCompleteDeliveredInboundDeliveryAttemptUseCase({
        currentTimeMilliseconds: () => Date.parse("2026-08-30T10:00:00.125Z"),
        repository: {
            completeDelivered: () => Promise.resolve({ outcome: "COMPLETED" })
        },
        workerId: "gateway-worker-1",
        ...overrides
    });
}
