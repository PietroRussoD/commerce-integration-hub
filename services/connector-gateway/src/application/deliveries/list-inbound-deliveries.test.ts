import { describe, expect, it, vi } from "vitest";

import {
    createListInboundDeliveriesUseCase,
    type InboundDeliveryInspectionRepository,
    type ListInboundDeliveriesQuery
} from "./list-inbound-deliveries.js";

describe("createListInboundDeliveriesUseCase", () => {
    it("delegates a valid bounded query", async () => {
        const page = { items: [], nextCursor: null };
        const { list, repository } = inspectionRepository(page);
        const query: ListInboundDeliveriesQuery = {
            limit: 25,
            provider: "ERP_B",
            statuses: ["EXHAUSTED", "PERMANENT_FAILURE"]
        };

        await expect(createListInboundDeliveriesUseCase(repository)(query)).resolves.toBe(page);
        expect(list).toHaveBeenCalledWith(query);
    });

    it("accepts a precise stable cursor", async () => {
        const { list, repository } = inspectionRepository();
        const query: ListInboundDeliveriesQuery = {
            cursor: {
                deliveryId: "0199037b-6400-7000-8000-000000000901",
                receivedAt: "2026-09-11T08:00:00.123456Z"
            },
            limit: 20
        };

        await createListInboundDeliveriesUseCase(repository)(query);

        expect(list).toHaveBeenCalledWith(query);
    });

    it.each([0, 101, 1.5, Number.NaN])("rejects the invalid page size %s", (limit) => {
        const { list, repository } = inspectionRepository();

        expect(() => createListInboundDeliveriesUseCase(repository)({ limit })).toThrow(
            "limit must be an integer between 1 and 100"
        );
        expect(list).not.toHaveBeenCalled();
    });

    it("rejects an explicitly empty status filter", () => {
        const { list, repository } = inspectionRepository();

        expect(() =>
            createListInboundDeliveriesUseCase(repository)({ limit: 20, statuses: [] })
        ).toThrow("statuses must contain at least one value when provided");
        expect(list).not.toHaveBeenCalled();
    });

    it("rejects a cursor with an invalid delivery identity", () => {
        const { list, repository } = inspectionRepository();

        expect(() =>
            createListInboundDeliveriesUseCase(repository)({
                cursor: { deliveryId: "not-a-uuid", receivedAt: "2026-09-11T08:00:00.000000Z" },
                limit: 20
            })
        ).toThrow("cursor deliveryId must be a canonical UUID");
        expect(list).not.toHaveBeenCalled();
    });

    it("rejects a cursor with an invalid receipt timestamp", () => {
        const { list, repository } = inspectionRepository();

        expect(() =>
            createListInboundDeliveriesUseCase(repository)({
                cursor: {
                    deliveryId: "0199037b-6400-7000-8000-000000000901",
                    receivedAt: "not-a-timestamp"
                },
                limit: 20
            })
        ).toThrow(
            "cursor receivedAt must be a UTC timestamp with microsecond precision"
        );
        expect(list).not.toHaveBeenCalled();
    });
});

function inspectionRepository(
    result = { items: [], nextCursor: null }
) {
    const list = vi.fn<InboundDeliveryInspectionRepository["list"]>().mockResolvedValue(result);
    return { list, repository: { list } };
}
