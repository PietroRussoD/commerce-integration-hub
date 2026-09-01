import { describe, expect, it } from "vitest";

import { classifyErpBOrderPage, type ErpBMappingErrorCode } from "./order-page-classifier.js";
import type { ErpBOrderChangePayload, ErpBOrderPagePayload } from "./order-page-parser.js";

const VALID_POSITION = {
    positionId: "1",
    articleNumber: "SKU-BOOK-1",
    units: "2",
    pricePerUnit: "19.99"
};

const VALID_CHANGE: ErpBOrderChangePayload = {
    changeId: "chg-00042",
    orderCode: "ERP-00042",
    currencyCode: "EUR",
    declaredTotal: "39.98",
    positions: [VALID_POSITION]
};

const PAGE: ErpBOrderPagePayload = {
    items: [VALID_CHANGE],
    nextCursor: "opaque-cursor-43",
    hasMore: true
};

const MAPPING_REJECTION_CASES: readonly {
    change: ErpBOrderChangePayload;
    errorCode: ErpBMappingErrorCode;
}[] = [
    {
        change: { ...VALID_CHANGE, orderCode: " ERP-00042" },
        errorCode: "ERP_B_INVALID_IDENTIFIER"
    },
    {
        change: {
            ...VALID_CHANGE,
            positions: [VALID_POSITION, { ...VALID_POSITION }]
        },
        errorCode: "ERP_B_DUPLICATE_POSITION_ID"
    },
    {
        change: {
            ...VALID_CHANGE,
            declaredTotal: "0.00",
            positions: [{ ...VALID_POSITION, units: "0" }]
        },
        errorCode: "ERP_B_NON_POSITIVE_QUANTITY"
    },
    {
        change: { ...VALID_CHANGE, declaredTotal: "39.99" },
        errorCode: "ERP_B_TOTAL_MISMATCH"
    }
];

describe("ERP_B order page classifier", () => {
    it("separates forwardable deliveries from permanent mapping rejections", () => {
        const poisonChange: ErpBOrderChangePayload = {
            ...VALID_CHANGE,
            changeId: "chg-00043",
            orderCode: "ERP-00043",
            currencyCode: "JPY"
        };

        const result = classifyErpBOrderPage({
            ...PAGE,
            items: [VALID_CHANGE, poisonChange]
        });

        expect(result.classified).toBe(true);
        if (result.classified) {
            expect(result.value.nextCursor).toBe("opaque-cursor-43");
            expect(result.value.hasMore).toBe(true);
            expect(result.value.deliveries).toHaveLength(1);
            expect(result.value.deliveries[0]?.externalEventId).toBe("chg-00042");
            expect(result.value.rejectedChanges).toHaveLength(1);
            expect(result.value.rejectedChanges[0]).toMatchObject({
                externalEventId: "chg-00043",
                mappingVersion: "erp-b-order-v1",
                errorCode: "ERP_B_UNSUPPORTED_CURRENCY"
            });
        }
    });

    it("preserves an empty final page and its checkpoint", () => {
        expect(classifyErpBOrderPage({ ...PAGE, items: [], hasMore: false })).toEqual({
            classified: true,
            value: {
                deliveries: [],
                rejectedChanges: [],
                nextCursor: "opaque-cursor-43",
                hasMore: false
            }
        });
    });

    it("collapses equivalent duplicate changes within the same page", () => {
        const result = classifyErpBOrderPage({
            ...PAGE,
            items: [VALID_CHANGE, { ...VALID_CHANGE }]
        });

        expect(result.classified).toBe(true);
        if (result.classified) {
            expect(result.value.deliveries).toHaveLength(1);
            expect(result.value.rejectedChanges).toHaveLength(0);
        }
    });

    it("rejects the whole page when one change ID has conflicting content", () => {
        const result = classifyErpBOrderPage({
            ...PAGE,
            items: [
                VALID_CHANGE,
                {
                    ...VALID_CHANGE,
                    positions: [{ ...VALID_POSITION, articleNumber: "SKU-BOOK-2" }]
                }
            ]
        });

        expect(result).toEqual({
            classified: false,
            reason: "conflicting_change_id",
            externalEventId: "chg-00042"
        });
    });

    it.each(MAPPING_REJECTION_CASES)(
        "maps poison content to $errorCode",
        ({ change, errorCode }) => {
            const result = classifyErpBOrderPage({ ...PAGE, items: [change] });

            expect(rejectionErrorCode(result)).toBe(errorCode);
        }
    );
});

function rejectionErrorCode(
    result: ReturnType<typeof classifyErpBOrderPage>
): ErpBMappingErrorCode | undefined {
    return result.classified ? result.value.rejectedChanges[0]?.errorCode : undefined;
}
