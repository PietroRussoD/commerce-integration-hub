import { describe, expect, it, vi } from "vitest";

import {
    createCompleteTerminalInboundDeliveryAttemptUseCase,
    type CompleteTerminalInboundDeliveryAttemptRequest,
    type TerminalInboundDeliveryAttemptRepository
} from "./complete-terminal-inbound-delivery-attempt.js";

const BASE_REQUEST = {
    attemptId: "0199037b-6400-7000-8000-000000000751",
    attemptNumber: 1,
    deliveryId: "0199037b-6400-7000-8000-000000000752",
    leaseToken: "0199037b-6400-7000-8000-000000000753"
};
const PERMANENT_REQUEST: CompleteTerminalInboundDeliveryAttemptRequest = {
    ...BASE_REQUEST,
    errorCode: "CORE_REQUEST_REJECTED",
    httpStatus: 422,
    outcome: "PERMANENT_FAILURE"
};
const BLOCKED_REQUEST: CompleteTerminalInboundDeliveryAttemptRequest = {
    ...BASE_REQUEST,
    errorCode: "CORE_AUTHENTICATION_REJECTED",
    httpStatus: 401,
    outcome: "BLOCKED_CONFIGURATION"
};

describe("createCompleteTerminalInboundDeliveryAttemptUseCase", () => {
    it.each([PERMANENT_REQUEST, BLOCKED_REQUEST])(
        "completes $outcome with operational metadata",
        async (request) => {
            const completeTerminal = vi
                .fn<TerminalInboundDeliveryAttemptRepository["completeTerminal"]>()
                .mockResolvedValue({ outcome: "COMPLETED" });
            const useCase = createUseCase({ repository: { completeTerminal } });

            await expect(useCase(request)).resolves.toEqual({ outcome: "COMPLETED" });
            expect(completeTerminal).toHaveBeenCalledWith({
                ...request,
                completedAt: new Date("2026-08-30T11:00:00.125Z"),
                workerId: "gateway-worker-1"
            });
        }
    );

    it("preserves a stale-claim result", async () => {
        const useCase = createUseCase({
            repository: {
                completeTerminal: () => Promise.resolve({ outcome: "STALE_CLAIM" })
            }
        });

        await expect(useCase(PERMANENT_REQUEST)).resolves.toEqual({ outcome: "STALE_CLAIM" });
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
            expect(() => useCase({ ...PERMANENT_REQUEST, [name]: "not-a-uuid" })).toThrow(
                `${name} must be a canonical UUID`
            );
        }
    );

    it.each([0, 6, 1.5])("rejects attempt number %s", (attemptNumber) => {
        const useCase = createUseCase();
        expect(() => useCase({ ...PERMANENT_REQUEST, attemptNumber })).toThrow(
            "attemptNumber must be an integer between 1 and 5"
        );
    });

    it.each([400, 404, 409, 422])("accepts permanent HTTP status %s", async (httpStatus) => {
        const useCase = createUseCase();
        await expect(
            useCase({ ...PERMANENT_REQUEST, httpStatus: httpStatus as 400 })
        ).resolves.toEqual({ outcome: "COMPLETED" });
    });

    it.each([401, 403])("accepts blocked HTTP status %s", async (httpStatus) => {
        const useCase = createUseCase();
        await expect(
            useCase({ ...BLOCKED_REQUEST, httpStatus: httpStatus as 401 })
        ).resolves.toEqual({ outcome: "COMPLETED" });
    });

    it("rejects an invalid permanent HTTP status", () => {
        const useCase = createUseCase();
        expect(() =>
            useCase({ ...PERMANENT_REQUEST, httpStatus: 401 as 400 })
        ).toThrow("permanent failure httpStatus must be 400, 404, 409, or 422");
    });

    it("rejects an invalid blocked HTTP status", () => {
        const useCase = createUseCase();
        expect(() => useCase({ ...BLOCKED_REQUEST, httpStatus: 400 as 401 })).toThrow(
            "blocked configuration httpStatus must be 401 or 403"
        );
    });
});

function createUseCase(
    overrides: Partial<
        Parameters<typeof createCompleteTerminalInboundDeliveryAttemptUseCase>[0]
    > = {}
) {
    return createCompleteTerminalInboundDeliveryAttemptUseCase({
        currentTimeMilliseconds: () => Date.parse("2026-08-30T11:00:00.125Z"),
        repository: {
            completeTerminal: () => Promise.resolve({ outcome: "COMPLETED" })
        },
        workerId: "gateway-worker-1",
        ...overrides
    });
}
