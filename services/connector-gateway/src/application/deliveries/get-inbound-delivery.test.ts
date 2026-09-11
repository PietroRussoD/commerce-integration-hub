import { describe, expect, it, vi } from "vitest";

import {
    createGetInboundDeliveryUseCase,
    type InboundDeliveryDetailRepository
} from "./get-inbound-delivery.js";

const DELIVERY_ID = "0199037b-6400-7000-8000-000000000901";

describe("createGetInboundDeliveryUseCase", () => {
    it("delegates a canonical delivery identity", async () => {
        const findById = vi
            .fn<InboundDeliveryDetailRepository["findById"]>()
            .mockResolvedValue(null);

        await expect(createGetInboundDeliveryUseCase({ findById })(DELIVERY_ID)).resolves.toBeNull();
        expect(findById).toHaveBeenCalledWith(DELIVERY_ID);
    });

    it("rejects an invalid delivery identity before persistence", () => {
        const findById = vi
            .fn<InboundDeliveryDetailRepository["findById"]>()
            .mockResolvedValue(null);

        expect(() => createGetInboundDeliveryUseCase({ findById })("not-a-uuid")).toThrow(
            "deliveryId must be a canonical UUID"
        );
        expect(findById).not.toHaveBeenCalled();
    });
});
