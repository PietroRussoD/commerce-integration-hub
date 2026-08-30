import { describe, expect, it } from "vitest";

import {
    decideInboundDeliveryRetry,
    hasInboundDeliveryDeadlineElapsed
} from "./inbound-delivery-retry-policy.js";

const COMPLETED_AT = new Date("2026-08-30T09:00:00.000Z");
const RECEIVED_AT = new Date("2026-08-30T08:00:00.000Z");

describe("inbound delivery retry policy", () => {
    it("uses equal jitter and honors Retry-After", () => {
        expect(decide({ randomValue: 0 })).toEqual({
            nextAttemptAt: new Date("2026-08-30T09:00:02.500Z"),
            targetStatus: "RETRY_WAIT"
        });
        expect(decide({ randomValue: 0.999_999 })).toEqual({
            nextAttemptAt: new Date("2026-08-30T09:00:05.000Z"),
            targetStatus: "RETRY_WAIT"
        });
        expect(decide({ retryAfterMilliseconds: 10_000 })).toEqual({
            nextAttemptAt: new Date("2026-08-30T09:00:10.000Z"),
            targetStatus: "RETRY_WAIT"
        });
    });

    it.each([
        { attemptNumber: 5 },
        { deliveryReceivedAt: new Date("2026-08-29T09:00:00.000Z") },
        {
            attemptNumber: 4,
            completedAt: new Date("2026-08-30T08:59:59.000Z"),
            deliveryReceivedAt: new Date("2026-08-29T09:09:58.000Z"),
            randomValue: 0.999
        }
    ])("exhausts a delivery at a retry bound", (overrides) => {
        expect(decide(overrides)).toEqual({ targetStatus: "EXHAUSTED" });
    });

    it.each([0, 6, 1.5])("rejects attempt number %s", (attemptNumber) => {
        expect(() => decide({ attemptNumber })).toThrow(
            "attemptNumber must be an integer between 1 and 5"
        );
    });

    it.each([
        ["completedAt", { completedAt: new Date("invalid") }],
        ["deliveryReceivedAt", { deliveryReceivedAt: new Date("invalid") }]
    ])("rejects invalid %s", (name, overrides) => {
        expect(() => decide(overrides)).toThrow(`${name} must be a valid date`);
    });

    it.each([-0.1, 1, Number.NaN])("rejects random value %s", (randomValue) => {
        expect(() => decide({ randomValue })).toThrow(
            "random must return a finite number between 0 inclusive and 1 exclusive"
        );
    });

    it.each([-1, 900_001, 1.5])("rejects Retry-After %s", (retryAfterMilliseconds) => {
        expect(() => decide({ retryAfterMilliseconds })).toThrow(
            "retryAfterMilliseconds must be an integer between 0 and 900000"
        );
    });

    it("detects the delivery age deadline", () => {
        expect(
            hasInboundDeliveryDeadlineElapsed(
                RECEIVED_AT,
                new Date("2026-08-31T07:59:59.999Z")
            )
        ).toBe(false);
        expect(
            hasInboundDeliveryDeadlineElapsed(
                RECEIVED_AT,
                new Date("2026-08-31T08:00:00.000Z")
            )
        ).toBe(true);
    });

    it.each([
        [new Date("invalid"), COMPLETED_AT, "deliveryReceivedAt"],
        [RECEIVED_AT, new Date("invalid"), "evaluatedAt"]
    ])("rejects invalid deadline dates", (receivedAt, evaluatedAt, name) => {
        expect(() => hasInboundDeliveryDeadlineElapsed(receivedAt, evaluatedAt)).toThrow(
            `${name} must be a valid date`
        );
    });
});

function decide(
    overrides: Partial<Parameters<typeof decideInboundDeliveryRetry>[0]> = {}
) {
    return decideInboundDeliveryRetry({
        attemptNumber: 1,
        completedAt: COMPLETED_AT,
        deliveryReceivedAt: RECEIVED_AT,
        randomValue: 0.5,
        ...overrides
    });
}
