import { describe, expect, it, vi } from "vitest";

import type { ReceiveInboundDeliveryCommand } from "./receive-inbound-delivery-command.js";
import {
    type InboundDeliveryRepository,
    createReceiveInboundDeliveryUseCase
} from "./receive-inbound-delivery.js";

const CONNECTOR_ID = "0199037b-5e4e-7d52-a1c9-75a10dfab125";
const COMMAND: ReceiveInboundDeliveryCommand = {
    externalEventId: "evt-2026-00042",
    providerPayloadHash: "a".repeat(64),
    providerPayloadJson: '{"eventId":"evt-2026-00042"}',
    mappingVersion: "marketplace-a-order-v1",
    canonicalOrder: {
        externalId: "MA-00042",
        currency: "EUR",
        declaredTotalAmount: "39.98",
        items: [
            {
                externalLineId: "1",
                sku: "SKU-BOOK-1",
                quantity: "2",
                unitPrice: "19.99"
            }
        ]
    }
};

describe("receive inbound delivery use case", () => {
    it.each([
        "CREATED",
        "EQUIVALENT_REPLAY",
        "PAYLOAD_CONFLICT"
    ] as const)("returns the repository outcome: %s", async (outcome) => {
        const result = {
            deliveryId: "01990380-8427-7bc1-b203-5cc23ee7a02d",
            outcome
        };
        const receive = vi
            .fn<InboundDeliveryRepository["receive"]>()
            .mockResolvedValue(result);
        const useCase = createReceiveInboundDeliveryUseCase({
            connectorId: CONNECTOR_ID,
            repository: { receive }
        });

        await expect(useCase(COMMAND)).resolves.toEqual(result);
        expect(receive).toHaveBeenCalledWith(CONNECTOR_ID, COMMAND);
    });

    it("does not reinterpret a repository failure", async () => {
        const failure = new Error("storage unavailable");
        const receive = vi
            .fn<InboundDeliveryRepository["receive"]>()
            .mockRejectedValue(failure);
        const useCase = createReceiveInboundDeliveryUseCase({
            connectorId: CONNECTOR_ID,
            repository: { receive }
        });

        await expect(useCase(COMMAND)).rejects.toBe(failure);
    });
});
