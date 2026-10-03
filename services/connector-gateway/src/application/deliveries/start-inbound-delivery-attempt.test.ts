import { describe, expect, it, vi } from "vitest";

import {
    createStartInboundDeliveryAttemptUseCase,
    type InboundDeliveryAttemptRepository
} from "./start-inbound-delivery-attempt.js";

const ATTEMPT_ID = "0199037b-6400-7000-8000-000000000701";
const DELIVERY_ID = "0199037b-6400-7000-8000-000000000702";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000703";

describe("createStartInboundDeliveryAttemptUseCase", () => {
    it("starts an attempt with generated operational metadata", async () => {
        const start = vi
            .fn<InboundDeliveryAttemptRepository["start"]>()
            .mockResolvedValue({
                attemptId: ATTEMPT_ID,
                attemptNumber: 1,
                deliveryReceivedAt: new Date("2026-08-30T08:00:00.000Z"),
                outcome: "STARTED",
                startedAt: new Date("2026-08-30T09:00:00.000Z")
            });
        const useCase = createUseCase({ repository: { start } });

        await useCase({
            deliveryId: DELIVERY_ID,
            leaseToken: LEASE_TOKEN,
            traceId: "a".repeat(32)
        });

        expect(start).toHaveBeenCalledWith({
            attemptId: ATTEMPT_ID,
            deliveryId: DELIVERY_ID,
            leaseToken: LEASE_TOKEN,
            startedAt: new Date("2026-08-30T09:00:00.000Z"),
            traceId: "a".repeat(32),
            workerId: "gateway-worker-1"
        });
    });

    it("preserves a stale-claim result", async () => {
        const useCase = createUseCase({
            repository: { start: () => Promise.resolve({ outcome: "STALE_CLAIM" }) }
        });

        await expect(
            useCase({ deliveryId: DELIVERY_ID, leaseToken: LEASE_TOKEN })
        ).resolves.toEqual({ outcome: "STALE_CLAIM" });
    });

    it.each(["", " ", "w".repeat(101)])("rejects invalid worker ID", (workerId) => {
        expect(() => createUseCase({ workerId })).toThrow(
            "workerId must contain between 1 and 100 characters"
        );
    });

    it.each([
        ["deliveryId", "not-a-uuid"],
        ["leaseToken", "not-a-uuid"]
    ] as const)("rejects invalid %s", (name, value) => {
        const useCase = createUseCase();

        expect(() =>
            useCase({
                deliveryId: name === "deliveryId" ? value : DELIVERY_ID,
                leaseToken: name === "leaseToken" ? value : LEASE_TOKEN
            })
        ).toThrow(`${name} must be a canonical UUID`);
    });

    it("rejects an invalid generated attempt ID", () => {
        const useCase = createUseCase({ createAttemptId: () => "not-a-uuid" });

        expect(() => useCase({ deliveryId: DELIVERY_ID, leaseToken: LEASE_TOKEN })).toThrow(
            "createAttemptId result must be a canonical UUID"
        );
    });

    it("rejects an invalid trace ID", () => {
        const useCase = createUseCase();

        expect(() =>
            useCase({
                deliveryId: DELIVERY_ID,
                leaseToken: LEASE_TOKEN,
                traceId: "NOT-A-TRACE-ID"
            })
        ).toThrow("traceId must be 32 lower-case hexadecimal characters");
    });

    it("rejects a trace ID that differs from the persisted trace context", () => {
        const useCase = createUseCase();

        expect(() =>
            useCase({
                deliveryId: DELIVERY_ID,
                leaseToken: LEASE_TOKEN,
                traceId: "a".repeat(32),
                traceContext: {
                    traceparent: "00-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2222222222222222-01"
                }
            })
        ).toThrow("traceId must match the trace ID in traceContext.traceparent");
    });

    it("persists a trace context when its trace ID is consistent", async () => {
        const traceContext = {
            traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01"
        };
        const start = vi
            .fn<InboundDeliveryAttemptRepository["start"]>()
            .mockResolvedValue({
                attemptId: ATTEMPT_ID,
                attemptNumber: 1,
                deliveryReceivedAt: new Date("2026-08-30T08:00:00.000Z"),
                outcome: "STARTED",
                startedAt: new Date("2026-08-30T09:00:00.000Z")
            });
        const useCase = createUseCase({ repository: { start } });

        await useCase({
            deliveryId: DELIVERY_ID,
            leaseToken: LEASE_TOKEN,
            traceId: "a".repeat(32),
            traceContext
        });

        expect(start).toHaveBeenCalledWith(expect.objectContaining({ traceContext }));
    });

    it("requires a trace ID when a trace context is provided", () => {
        const useCase = createUseCase();

        expect(() =>
            useCase({
                deliveryId: DELIVERY_ID,
                leaseToken: LEASE_TOKEN,
                traceContext: {
                    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01"
                }
            })
        ).toThrow("traceId is required when traceContext is provided");
    });
});

function createUseCase(
    overrides: Partial<Parameters<typeof createStartInboundDeliveryAttemptUseCase>[0]> = {}
) {
    return createStartInboundDeliveryAttemptUseCase({
        createAttemptId: () => ATTEMPT_ID,
        currentTimeMilliseconds: () => Date.parse("2026-08-30T09:00:00.000Z"),
        repository: {
            start: () =>
                Promise.resolve({
                    attemptId: ATTEMPT_ID,
                    attemptNumber: 1,
                    deliveryReceivedAt: new Date("2026-08-30T08:00:00.000Z"),
                    outcome: "STARTED",
                    startedAt: new Date("2026-08-30T09:00:00.000Z")
                })
        },
        workerId: "gateway-worker-1",
        ...overrides
    });
}
