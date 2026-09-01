import { describe, expect, it } from "vitest";

import type { MappedErpBOrderChange } from "./order-page-mapper.js";
import type { ErpBOrderChangePayload } from "./order-page-parser.js";
import {
    createErpBInboundDeliveryCommand,
    createErpBProviderItemEvidence
} from "./order-change-receipt-command.js";

const PROVIDER_PAYLOAD_JSON =
    '{"canonicalizationVersion":"erp-b-provider-item-v1","changeId":"chg-00042","orderCode":"ERP-00042","currencyCode":"EUR","declaredTotal":"39.98","positions":[{"positionId":"1","articleNumber":"SKU-BOOK-1","units":"2","pricePerUnit":"19.99"}]}';
// Precomputed with shasum to keep the expected fingerprint independent of Node's crypto API.
const PROVIDER_PAYLOAD_SHA_256 =
    "e4b2ede6ca5ef28ef11b6c9333161e2ddba900955e666e4e27499fc8aac46ef3";

const CHANGE_POSITION = {
    positionId: "1",
    articleNumber: "SKU-BOOK-1",
    units: "2",
    pricePerUnit: "19.99"
};

const CHANGE: ErpBOrderChangePayload = {
    changeId: "chg-00042",
    orderCode: "ERP-00042",
    currencyCode: "EUR",
    declaredTotal: "39.98",
    positions: [CHANGE_POSITION]
};

const MAPPED_CHANGE: MappedErpBOrderChange = {
    providerEventId: "chg-00042",
    mappingVersion: "erp-b-order-v1",
    canonicalOrder: {
        externalId: "ERP-00042",
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

describe("ERP_B inbound delivery command", () => {
    it("captures provider identity, versioned item fingerprint and canonical mapping", () => {
        expect(createCommand(CHANGE)).toEqual({
            externalEventId: "chg-00042",
            providerPayloadHash: PROVIDER_PAYLOAD_SHA_256,
            providerPayloadJson: PROVIDER_PAYLOAD_JSON,
            mappingVersion: "erp-b-order-v1",
            canonicalOrder: MAPPED_CHANGE.canonicalOrder
        });
    });

    it("does not depend on the insertion order of provider object properties", () => {
        const reorderedChange: ErpBOrderChangePayload = {
            positions: [
                {
                    pricePerUnit: "19.99",
                    units: "2",
                    articleNumber: "SKU-BOOK-1",
                    positionId: "1"
                }
            ],
            declaredTotal: "39.98",
            currencyCode: "EUR",
            orderCode: "ERP-00042",
            changeId: "chg-00042"
        };

        expect(createCommand(reorderedChange)).toEqual(createCommand(CHANGE));
    });

    it("produces a different fingerprint when provider content changes", () => {
        const changed = createCommand({
            ...CHANGE,
            positions: [{ ...CHANGE_POSITION, articleNumber: "SKU-BOOK-2" }]
        });

        expect(changed.providerPayloadHash).not.toBe(PROVIDER_PAYLOAD_SHA_256);
        expect(changed.providerPayloadJson).toContain("SKU-BOOK-2");
    });

    it("rejects a mapping created for a different provider change", () => {
        expect(() =>
            createErpBInboundDeliveryCommand(createErpBProviderItemEvidence(CHANGE), {
                ...MAPPED_CHANGE,
                providerEventId: "chg-99999"
            })
        ).toThrow("ERP_B change identity does not match its canonical mapping");
    });
});

function createCommand(change: ErpBOrderChangePayload) {
    return createErpBInboundDeliveryCommand(
        createErpBProviderItemEvidence(change),
        MAPPED_CHANGE
    );
}
