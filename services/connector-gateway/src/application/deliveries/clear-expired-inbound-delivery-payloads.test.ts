import { describe, expect, it, vi } from "vitest";

import { createClearExpiredInboundDeliveryPayloadsUseCase } from "./clear-expired-inbound-delivery-payloads.js";

describe("clear expired inbound delivery payloads", () => {
    it.each([0, -1, 101, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
        "rejects an invalid batch size %s before database access", batchSize => {
            const clearExpiredTerminalPayloads = vi.fn();
            expect(() => createClearExpiredInboundDeliveryPayloadsUseCase({
                batchSize, repository: { clearExpiredTerminalPayloads }
            })).toThrow("batchSize must be an integer between 1 and 100");
            expect(clearExpiredTerminalPayloads).not.toHaveBeenCalled();
        }
    );

    it.each([1, 100])("runs one bounded batch of %s without draining a backlog", async batchSize => {
        const clearExpiredTerminalPayloads = vi.fn().mockResolvedValue(batchSize);
        const clear = createClearExpiredInboundDeliveryPayloadsUseCase({
            batchSize, repository: { clearExpiredTerminalPayloads }
        });
        expect(await clear()).toBe(batchSize);
        expect(clearExpiredTerminalPayloads).toHaveBeenCalledExactlyOnceWith(batchSize);
    });

    it("returns zero when no payload is eligible", async () => {
        const clear = createClearExpiredInboundDeliveryPayloadsUseCase({
            batchSize: 10, repository: { clearExpiredTerminalPayloads: vi.fn().mockResolvedValue(0) }
        });
        expect(await clear()).toBe(0);
    });

    it("propagates failure so a caller cannot report successful clearing", async () => {
        const error = new Error("Synthetic database failure");
        const clear = createClearExpiredInboundDeliveryPayloadsUseCase({
            batchSize: 10, repository: { clearExpiredTerminalPayloads: vi.fn().mockRejectedValue(error) }
        });
        await expect(clear()).rejects.toBe(error);
    });
});
