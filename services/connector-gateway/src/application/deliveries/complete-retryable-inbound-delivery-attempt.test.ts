import { describe, expect, it, vi } from "vitest";

import {
    createCompleteRetryableInboundDeliveryAttemptUseCase,
    type RetryableInboundDeliveryAttemptRepository
} from "./complete-retryable-inbound-delivery-attempt.js";

const COMPLETED_AT = new Date("2026-08-30T09:00:00.000Z");
const REQUEST = {
    attemptId: "0199037b-6400-7000-8000-000000000741",
    attemptNumber: 1,
    deliveryId: "0199037b-6400-7000-8000-000000000742",
    deliveryReceivedAt: new Date("2026-08-30T08:00:00.000Z"),
    errorCode: "CORE_RETRYABLE_STATUS" as const,
    httpStatus: 503,
    leaseToken: "0199037b-6400-7000-8000-000000000743"
};

describe("createCompleteRetryableInboundDeliveryAttemptUseCase", () => {
    it("schedules a retry using equal jitter", async () => {
        const completeRetryable = vi
            .fn<RetryableInboundDeliveryAttemptRepository["completeRetryable"]>()
            .mockResolvedValue({ outcome: "COMPLETED" });
        const useCase = createUseCase({ random: () => 0, repository: { completeRetryable } });

        await expect(useCase(REQUEST)).resolves.toEqual({ outcome: "COMPLETED" });
        expect(completeRetryable).toHaveBeenCalledWith({
            ...REQUEST,
            completedAt: COMPLETED_AT,
            nextAttemptAt: new Date("2026-08-30T09:00:02.500Z"),
            targetStatus: "RETRY_WAIT",
            workerId: "gateway-worker-1"
        });
    });

    it("honors a longer bounded Retry-After", async () => {
        const completeRetryable = vi
            .fn<RetryableInboundDeliveryAttemptRepository["completeRetryable"]>()
            .mockResolvedValue({ outcome: "COMPLETED" });
        const useCase = createUseCase({ random: () => 0, repository: { completeRetryable } });

        await useCase({ ...REQUEST, retryAfterMilliseconds: 10_000 });

        expect(completeRetryable).toHaveBeenCalledWith(
            expect.objectContaining({
                nextAttemptAt: new Date("2026-08-30T09:00:10.000Z"),
                targetStatus: "RETRY_WAIT"
            })
        );
    });

    it.each([
        [5, new Date("2026-08-30T08:00:00.000Z")],
        [1, new Date("2026-08-29T09:00:00.000Z")],
        [1, new Date("2026-08-29T09:00:01.000Z")]
    ])("exhausts attempt %s received at %s", async (attemptNumber, deliveryReceivedAt) => {
        const completeRetryable = vi
            .fn<RetryableInboundDeliveryAttemptRepository["completeRetryable"]>()
            .mockResolvedValue({ outcome: "COMPLETED" });
        const useCase = createUseCase({ random: () => 0, repository: { completeRetryable } });

        await useCase({ ...REQUEST, attemptNumber, deliveryReceivedAt });

        expect(completeRetryable).toHaveBeenCalledWith({
            ...REQUEST,
            attemptNumber,
            completedAt: COMPLETED_AT,
            deliveryReceivedAt,
            targetStatus: "EXHAUSTED",
            workerId: "gateway-worker-1"
        });
    });

    it("preserves a stale-claim result", async () => {
        const useCase = createUseCase({
            repository: {
                completeRetryable: () => Promise.resolve({ outcome: "STALE_CLAIM" })
            }
        });

        await expect(useCase(REQUEST)).resolves.toEqual({ outcome: "STALE_CLAIM" });
    });

    it.each(["", " ", "w".repeat(101)])("rejects invalid worker ID", (workerId) => {
        expect(() => createUseCase({ workerId })).toThrow(
            "workerId must contain between 1 and 100 characters"
        );
    });

    it.each(["attemptId", "deliveryId", "leaseToken"] as const)(
        "rejects invalid %s",
        (name) => {
            const useCase = createUseCase();
            expect(() => useCase({ ...REQUEST, [name]: "not-a-uuid" })).toThrow(
                `${name} must be a canonical UUID`
            );
        }
    );

    it.each([0, 6, 1.5])("rejects attempt number %s", (attemptNumber) => {
        const useCase = createUseCase();
        expect(() => useCase({ ...REQUEST, attemptNumber })).toThrow(
            "attemptNumber must be an integer between 1 and 5"
        );
    });

    it("rejects an invalid delivery receipt time", () => {
        const useCase = createUseCase();
        expect(() =>
            useCase({ ...REQUEST, deliveryReceivedAt: new Date("invalid") })
        ).toThrow("deliveryReceivedAt must be a valid date");
    });

    it.each([99, 600, 1.5])("rejects HTTP status %s", (httpStatus) => {
        const useCase = createUseCase();
        expect(() => useCase({ ...REQUEST, httpStatus })).toThrow(
            "httpStatus must be an integer between 100 and 599"
        );
    });

    it.each([-1, 900_001, 1.5])("rejects Retry-After %s", (retryAfterMilliseconds) => {
        const useCase = createUseCase();
        expect(() => useCase({ ...REQUEST, retryAfterMilliseconds })).toThrow(
            "retryAfterMilliseconds must be an integer between 0 and 900000"
        );
    });

    it.each([-0.1, 1, Number.NaN])("rejects random value %s", (randomValue) => {
        const useCase = createUseCase({ random: () => randomValue });
        expect(() => useCase(REQUEST)).toThrow(
            "random must return a finite number between 0 inclusive and 1 exclusive"
        );
    });
});

function createUseCase(
    overrides: Partial<
        Parameters<typeof createCompleteRetryableInboundDeliveryAttemptUseCase>[0]
    > = {}
) {
    return createCompleteRetryableInboundDeliveryAttemptUseCase({
        currentTimeMilliseconds: () => COMPLETED_AT.getTime(),
        random: () => 0.5,
        repository: {
            completeRetryable: () => Promise.resolve({ outcome: "COMPLETED" })
        },
        workerId: "gateway-worker-1",
        ...overrides
    });
}
