import { describe, expect, it } from "vitest";

import type { MappedMarketplaceAOrderWebhook } from "./webhook-payload-mapper.js";
import { createMarketplaceAInboundDeliveryCommand } from "./webhook-receipt-command.js";

const RAW_BODY =
    '{"eventId":"evt-2026-00042","eventType":"order.created","order":{"orderNumber":"MA-00042","currency":"EUR","totalCents":3998,"lines":[{"lineNumber":"1","productCode":"SKU-BOOK-1","quantity":2,"unitPriceCents":1999}]}}';
// Precomputed with shasum to keep the expected fingerprint independent of Node's crypto API.
const RAW_BODY_SHA_256 = "505287e234dca1b846dabbf848e34f6ba1833a0e8e6144c116be8f65c0f5b2cb";
const MAPPED_WEBHOOK: MappedMarketplaceAOrderWebhook = {
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
};

describe("MARKETPLACE_A inbound delivery command", () => {
    it("captures the provider identity, exact payload fingerprint and canonical mapping", () => {
        expect(
            createMarketplaceAInboundDeliveryCommand(Buffer.from(RAW_BODY), MAPPED_WEBHOOK)
        ).toEqual({
            externalEventId: "evt-2026-00042",
            providerPayloadHash: RAW_BODY_SHA_256,
            providerPayloadJson: RAW_BODY,
            mappingVersion: "marketplace-a-order-v1",
            canonicalOrder: MAPPED_WEBHOOK.canonicalOrder
        });
    });

    it("produces a different fingerprint when only raw JSON whitespace changes", () => {
        const original = createMarketplaceAInboundDeliveryCommand(
            Buffer.from(RAW_BODY),
            MAPPED_WEBHOOK
        );
        const bodyWithWhitespace = `${RAW_BODY}\n`;
        const changed = createMarketplaceAInboundDeliveryCommand(
            Buffer.from(bodyWithWhitespace),
            MAPPED_WEBHOOK
        );

        expect(changed.providerPayloadHash).not.toBe(original.providerPayloadHash);
        expect(changed.providerPayloadJson).toBe(bodyWithWhitespace);
        expect(changed.canonicalOrder).toBe(original.canonicalOrder);
    });

    it("rejects invalid UTF-8 even if called outside the validated route flow", () => {
        expect(() =>
            createMarketplaceAInboundDeliveryCommand(new Uint8Array([0xff]), MAPPED_WEBHOOK)
        ).toThrow();
    });
});
