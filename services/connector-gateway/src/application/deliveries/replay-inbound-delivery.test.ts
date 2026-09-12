import { describe, expect, it, vi } from "vitest";

import {
    createReplayInboundDeliveryUseCase,
    type ReplayInboundDeliveryRepository
} from "./replay-inbound-delivery.js";

const COMMAND_ID = "0199037b-6400-7000-8000-000000000831";
const DELIVERY_ID = "0199037b-6400-7000-8000-000000000832";
const IDEMPOTENCY_KEY = "0199037b-6400-7000-8000-000000000833";
const REPLAYED_AT = new Date("2026-09-12T10:00:00.000Z");

describe("replay inbound delivery", () => {
    it("validates and delegates an operator replay command", async () => {
        const repository = { replay: vi.fn<ReplayInboundDeliveryRepository["replay"]>() };
        repository.replay.mockResolvedValue({ commandId: COMMAND_ID, outcome: "REPLAYED" });
        const replay = createReplayInboundDeliveryUseCase({
            createCommandId: () => COMMAND_ID,
            currentTimeMilliseconds: () => REPLAYED_AT.getTime(),
            repository
        });

        await expect(replay(request())).resolves.toEqual({
            commandId: COMMAND_ID,
            outcome: "REPLAYED"
        });
        expect(repository.replay).toHaveBeenCalledWith({
            ...request(),
            action: "DELIVERY_REPLAY",
            commandId: COMMAND_ID,
            replayedAt: REPLAYED_AT
        });
    });

    it("rejects malformed operator input before starting a command", () => {
        const repository = { replay: vi.fn<ReplayInboundDeliveryRepository["replay"]>() };
        const replay = createReplayInboundDeliveryUseCase({ repository });

        expect(() => replay({ ...request(), actorSubject: " operator-42" })).toThrow(
            "actorSubject must be non-blank"
        );
        expect(repository.replay).not.toHaveBeenCalled();
    });
});

function request() {
    return {
        actorSubject: "operator-42",
        deliveryId: DELIVERY_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: "Retry after the upstream incident was resolved"
    };
}
