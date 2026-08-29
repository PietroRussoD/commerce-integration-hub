import { describe, expect, it } from "vitest";

import type { MarketplaceAWebhookPayload } from "./webhook-payload-parser.js";
import { mapMarketplaceAWebhookPayload } from "./webhook-payload-mapper.js";

const VALID_PAYLOAD: MarketplaceAWebhookPayload = {
    eventId: "evt-2026-00042",
    eventType: "order.created",
    order: {
        orderNumber: "MA-00042",
        currency: "EUR",
        totalCents: 3998,
        lines: [
            {
                lineNumber: "1",
                productCode: "SKU-BOOK-1",
                quantity: 2,
                unitPriceCents: 1999
            }
        ]
    }
};

describe("MARKETPLACE_A webhook payload mapper", () => {
    it("maps a supported order into the canonical model", () => {
        expect(mapMarketplaceAWebhookPayload(VALID_PAYLOAD)).toEqual({
            mapped: true,
            value: {
                providerEventId: "evt-2026-00042",
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
            }
        });
    });

    it.each([
        [5, "0.05"],
        [100, "1.00"]
    ] as const)("formats %s cents as %s without floating-point arithmetic", (cents, expected) => {
        const payload: MarketplaceAWebhookPayload = {
            ...VALID_PAYLOAD,
            order: {
                ...VALID_PAYLOAD.order,
                totalCents: cents,
                lines: [
                    {
                        lineNumber: "1",
                        productCode: "SKU-CENTS",
                        quantity: 1,
                        unitPriceCents: cents
                    }
                ]
            }
        };

        const result = mapMarketplaceAWebhookPayload(payload);

        expect(result.mapped).toBe(true);
        if (result.mapped) {
            expect(result.value.canonicalOrder.declaredTotalAmount).toBe(expected);
            expect(result.value.canonicalOrder.items[0]?.unitPrice).toBe(expected);
        }
    });

    it.each(["order.cancelled", "order.updated"])(
        "rejects an unsupported event type: %s",
        (eventType) => {
            expect(mapMarketplaceAWebhookPayload({ ...VALID_PAYLOAD, eventType })).toEqual({
                mapped: false,
                reason: "unsupported_event_type"
            });
        }
    );

    it("rejects a currency unsupported by the canonical core", () => {
        const payload: MarketplaceAWebhookPayload = {
            ...VALID_PAYLOAD,
            order: { ...VALID_PAYLOAD.order, currency: "JPY" }
        };

        expect(mapMarketplaceAWebhookPayload(payload)).toEqual({
            mapped: false,
            reason: "unsupported_currency"
        });
    });

    it("rejects duplicate provider line numbers", () => {
        const payload: MarketplaceAWebhookPayload = {
            ...VALID_PAYLOAD,
            order: {
                ...VALID_PAYLOAD.order,
                totalCents: 5997,
                lines: [
                    ...VALID_PAYLOAD.order.lines,
                    {
                        lineNumber: "1",
                        productCode: "SKU-BOOK-2",
                        quantity: 1,
                        unitPriceCents: 1999
                    }
                ]
            }
        };

        expect(mapMarketplaceAWebhookPayload(payload)).toEqual({
            mapped: false,
            reason: "duplicate_line_number"
        });
    });

    it("rejects a declared total that differs from the exact line total", () => {
        const payload: MarketplaceAWebhookPayload = {
            ...VALID_PAYLOAD,
            order: { ...VALID_PAYLOAD.order, totalCents: 3999 }
        };

        expect(mapMarketplaceAWebhookPayload(payload)).toEqual({
            mapped: false,
            reason: "total_mismatch"
        });
    });
});
