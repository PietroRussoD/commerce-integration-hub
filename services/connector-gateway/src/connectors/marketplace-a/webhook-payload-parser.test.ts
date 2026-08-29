import { describe, expect, it } from "vitest";

import { parseMarketplaceAWebhookPayload } from "./webhook-payload-parser.js";

const VALID_PAYLOAD = {
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

describe("MARKETPLACE_A webhook payload parser", () => {
    it("parses a valid provider payload", () => {
        expect(parse(VALID_PAYLOAD)).toEqual({ valid: true, payload: VALID_PAYLOAD });
    });

    it("accepts a structurally valid event type for later semantic mapping", () => {
        const payload = { ...VALID_PAYLOAD, eventType: "order.cancelled" };

        expect(parse(payload)).toEqual({ valid: true, payload });
    });

    it("rejects malformed JSON", () => {
        expect(parseMarketplaceAWebhookPayload(Buffer.from('{"eventId":', "utf8"))).toEqual({
            valid: false,
            reason: "malformed_json"
        });
    });

    it("rejects invalid UTF-8 instead of replacing invalid bytes", () => {
        const invalidUtf8 = Buffer.concat([
            Buffer.from('{"eventId":"', "utf8"),
            Buffer.from([0xff]),
            Buffer.from('"}', "utf8")
        ]);

        expect(parseMarketplaceAWebhookPayload(invalidUtf8)).toEqual({
            valid: false,
            reason: "malformed_json"
        });
    });

    it.each([
        { ...VALID_PAYLOAD, unexpected: true },
        { ...VALID_PAYLOAD, order: { ...VALID_PAYLOAD.order, unexpected: true } },
        {
            ...VALID_PAYLOAD,
            order: {
                ...VALID_PAYLOAD.order,
                lines: [{ ...VALID_PAYLOAD.order.lines[0], unexpected: true }]
            }
        }
    ])("rejects unknown fields", (payload) => {
        expect(parse(payload)).toEqual({ valid: false, reason: "schema_invalid" });
    });

    it.each([
        { ...VALID_PAYLOAD, eventId: "" },
        { ...VALID_PAYLOAD, eventType: "ORDER_CREATED" },
        { ...VALID_PAYLOAD, order: { ...VALID_PAYLOAD.order, currency: "eur" } },
        { ...VALID_PAYLOAD, order: { ...VALID_PAYLOAD.order, lines: [] } },
        {
            ...VALID_PAYLOAD,
            order: {
                ...VALID_PAYLOAD.order,
                lines: [{ ...VALID_PAYLOAD.order.lines[0], quantity: "2" }]
            }
        },
        { ...VALID_PAYLOAD, order: { ...VALID_PAYLOAD.order, totalCents: -1 } },
        {
            ...VALID_PAYLOAD,
            order: { ...VALID_PAYLOAD.order, totalCents: Number.MAX_SAFE_INTEGER + 1 }
        }
    ])("rejects a payload outside the provider schema", (payload) => {
        expect(parse(payload)).toEqual({ valid: false, reason: "schema_invalid" });
    });

    it("rejects more than 500 order lines", () => {
        const payload = {
            ...VALID_PAYLOAD,
            order: {
                ...VALID_PAYLOAD.order,
                lines: Array.from({ length: 501 }, (_, index) => ({
                    ...VALID_PAYLOAD.order.lines[0],
                    lineNumber: String(index + 1)
                }))
            }
        };

        expect(parse(payload)).toEqual({ valid: false, reason: "schema_invalid" });
    });
});

function parse(payload: unknown) {
    return parseMarketplaceAWebhookPayload(Buffer.from(JSON.stringify(payload), "utf8"));
}
