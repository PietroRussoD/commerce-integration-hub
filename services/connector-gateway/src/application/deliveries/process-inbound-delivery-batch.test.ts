import { describe, expect, it, vi } from "vitest";

import type { ClaimedInboundDelivery } from "./claim-inbound-deliveries.js";
import { createProcessInboundDeliveryBatchUseCase } from "./process-inbound-delivery-batch.js";

const DELIVERY: ClaimedInboundDelivery = {
    canonicalOrder: {
        currency: "EUR",
        declaredTotalAmount: "10.00",
        externalId: "order-1",
        items: [
            {
                externalLineId: "line-1",
                quantity: "1",
                sku: "SKU-1",
                unitPrice: "10.00"
            }
        ]
    },
    connectorId: "0199037b-6400-7000-8000-000000000761",
    deliveryId: "0199037b-6400-7000-8000-000000000762",
    leaseToken: "0199037b-6400-7000-8000-000000000763"
};
const STARTED_ATTEMPT = {
    attemptId: "0199037b-6400-7000-8000-000000000764",
    attemptNumber: 1,
    deliveryReceivedAt: new Date("2026-08-30T08:00:00.000Z"),
    outcome: "STARTED" as const,
    startedAt: new Date("2026-08-30T09:00:00.000Z")
};

describe("createProcessInboundDeliveryBatchUseCase", () => {
    it("claims nothing without starting network work", async () => {
        const dependencies = createDependencies();
        dependencies.claimInboundDeliveries.mockResolvedValue([]);

        await expect(createUseCase(dependencies)()).resolves.toEqual({
            blockedConfigurations: 0,
            claimed: 0,
            delivered: 0,
            permanentFailures: 0,
            retryableFailures: 0,
            staleClaims: 0
        });
        expect(dependencies.startAttempt).not.toHaveBeenCalled();
        expect(dependencies.forwarder.forward).not.toHaveBeenCalled();
    });

    it("starts, forwards, and completes a delivered order", async () => {
        const dependencies = createDependencies();
        dependencies.forwarder.forward.mockResolvedValue({
            coreOrderId: "0199037b-6400-7000-8000-000000000765",
            equivalentReplay: false,
            httpStatus: 201,
            outcome: "DELIVERED"
        });

        await expect(createUseCase(dependencies)()).resolves.toEqual(
            expect.objectContaining({ claimed: 1, delivered: 1 })
        );
        expect(dependencies.startAttempt).toHaveBeenCalledWith({
            deliveryId: DELIVERY.deliveryId,
            leaseToken: DELIVERY.leaseToken
        });
        expect(dependencies.forwarder.forward).toHaveBeenCalledWith({
            canonicalOrder: DELIVERY.canonicalOrder
        });
        expect(dependencies.completeDelivered).toHaveBeenCalledWith({
            attemptId: STARTED_ATTEMPT.attemptId,
            coreOrderId: "0199037b-6400-7000-8000-000000000765",
            deliveryId: DELIVERY.deliveryId,
            httpStatus: 201,
            leaseToken: DELIVERY.leaseToken
        });
    });

    it("passes cancellation and persists a retryable result", async () => {
        const dependencies = createDependencies();
        const controller = new AbortController();
        dependencies.forwarder.forward.mockResolvedValue({
            errorCode: "CORE_RETRYABLE_STATUS",
            httpStatus: 429,
            outcome: "RETRYABLE_FAILURE",
            retryAfterMilliseconds: 10_000
        });

        await expect(
            createUseCase(dependencies)({ signal: controller.signal })
        ).resolves.toEqual(expect.objectContaining({ retryableFailures: 1 }));
        expect(dependencies.forwarder.forward).toHaveBeenCalledWith({
            canonicalOrder: DELIVERY.canonicalOrder,
            signal: controller.signal
        });
        expect(dependencies.completeRetryable).toHaveBeenCalledWith({
            attemptId: STARTED_ATTEMPT.attemptId,
            attemptNumber: 1,
            deliveryId: DELIVERY.deliveryId,
            deliveryReceivedAt: STARTED_ATTEMPT.deliveryReceivedAt,
            errorCode: "CORE_RETRYABLE_STATUS",
            httpStatus: 429,
            leaseToken: DELIVERY.leaseToken,
            retryAfterMilliseconds: 10_000
        });
    });

    it("omits absent optional retry metadata", async () => {
        const dependencies = createDependencies();
        dependencies.forwarder.forward.mockResolvedValue({
            errorCode: "CORE_NETWORK_ERROR",
            outcome: "RETRYABLE_FAILURE"
        });

        await createUseCase(dependencies)();

        expect(dependencies.completeRetryable).toHaveBeenCalledWith({
            attemptId: STARTED_ATTEMPT.attemptId,
            attemptNumber: 1,
            deliveryId: DELIVERY.deliveryId,
            deliveryReceivedAt: STARTED_ATTEMPT.deliveryReceivedAt,
            errorCode: "CORE_NETWORK_ERROR",
            leaseToken: DELIVERY.leaseToken
        });
    });

    it.each([
        [
            {
                errorCode: "CORE_AUTHENTICATION_REJECTED" as const,
                httpStatus: 401 as const,
                outcome: "BLOCKED_CONFIGURATION" as const
            },
            "blockedConfigurations"
        ],
        [
            {
                errorCode: "CORE_REQUEST_REJECTED" as const,
                httpStatus: 422 as const,
                outcome: "PERMANENT_FAILURE" as const
            },
            "permanentFailures"
        ]
    ] as const)("persists terminal outcome $0.outcome", async (forwardingResult, countName) => {
        const dependencies = createDependencies();
        dependencies.forwarder.forward.mockResolvedValue(forwardingResult);

        const result = await createUseCase(dependencies)();

        expect(result[countName]).toBe(1);
        expect(dependencies.completeTerminal).toHaveBeenCalledWith({
            attemptId: STARTED_ATTEMPT.attemptId,
            attemptNumber: 1,
            deliveryId: DELIVERY.deliveryId,
            leaseToken: DELIVERY.leaseToken,
            ...forwardingResult
        });
    });

    it("does not forward a stale attempt start", async () => {
        const dependencies = createDependencies();
        dependencies.startAttempt.mockResolvedValue({ outcome: "STALE_CLAIM" });

        await expect(createUseCase(dependencies)()).resolves.toEqual(
            expect.objectContaining({ staleClaims: 1 })
        );
        expect(dependencies.forwarder.forward).not.toHaveBeenCalled();
    });

    it("reports a stale completion instead of its forwarding outcome", async () => {
        const dependencies = createDependencies();
        dependencies.forwarder.forward.mockResolvedValue({
            coreOrderId: "0199037b-6400-7000-8000-000000000765",
            equivalentReplay: true,
            httpStatus: 200,
            outcome: "DELIVERED"
        });
        dependencies.completeDelivered.mockResolvedValue({ outcome: "STALE_CLAIM" });

        await expect(createUseCase(dependencies)()).resolves.toEqual(
            expect.objectContaining({ delivered: 0, staleClaims: 1 })
        );
    });
});

function createDependencies() {
    return {
        claimInboundDeliveries: vi.fn().mockResolvedValue([DELIVERY]),
        completeDelivered: vi.fn().mockResolvedValue({ outcome: "COMPLETED" as const }),
        completeRetryable: vi.fn().mockResolvedValue({ outcome: "COMPLETED" as const }),
        completeTerminal: vi.fn().mockResolvedValue({ outcome: "COMPLETED" as const }),
        forwarder: { forward: vi.fn() },
        startAttempt: vi.fn().mockResolvedValue(STARTED_ATTEMPT)
    };
}

function createUseCase(dependencies: ReturnType<typeof createDependencies>) {
    return createProcessInboundDeliveryBatchUseCase(dependencies);
}
