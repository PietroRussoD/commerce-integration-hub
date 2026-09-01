import { describe, expect, it } from "vitest";

import type { ErpBOrderChangePayload } from "./order-page-parser.js";
import { mapErpBOrderChange } from "./order-page-mapper.js";

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

const INVALID_IDENTIFIER_CHANGES: ErpBOrderChangePayload[] = [
    { ...VALID_CHANGE, orderCode: " ERP-00042" },
    {
        ...VALID_CHANGE,
        positions: [{ ...VALID_POSITION, positionId: "1 " }]
    },
    {
        ...VALID_CHANGE,
        positions: [{ ...VALID_POSITION, articleNumber: " SKU-BOOK-1" }]
    }
];

describe("ERP_B order page mapper", () => {
    it("maps a supported change into the canonical model", () => {
        expect(mapErpBOrderChange(VALID_CHANGE)).toEqual({
            mapped: true,
            value: {
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
            }
        });
    });

    it("normalizes decimal strings and applies line-level HALF_UP rounding", () => {
        const change: ErpBOrderChangePayload = {
            ...VALID_CHANGE,
            declaredTotal: "2.48",
            positions: [
                {
                    ...VALID_POSITION,
                    units: "1.2345",
                    pricePerUnit: "2.00"
                },
                {
                    positionId: "2",
                    articleNumber: "SKU-ROUNDING",
                    units: "0.0050",
                    pricePerUnit: "1.00"
                }
            ]
        };

        const result = mapErpBOrderChange(change);

        expect(result.mapped).toBe(true);
        if (result.mapped) {
            expect(result.value.canonicalOrder).toEqual({
                externalId: "ERP-00042",
                currency: "EUR",
                declaredTotalAmount: "2.48",
                items: [
                    {
                        externalLineId: "1",
                        sku: "SKU-BOOK-1",
                        quantity: "1.2345",
                        unitPrice: "2"
                    },
                    {
                        externalLineId: "2",
                        sku: "SKU-ROUNDING",
                        quantity: "0.005",
                        unitPrice: "1"
                    }
                ]
            });
        }
    });

    it("rounds a line total down when it is below half a minor unit", () => {
        const change: ErpBOrderChangePayload = {
            ...VALID_CHANGE,
            declaredTotal: "2.46",
            positions: [{ ...VALID_POSITION, units: "1.2324", pricePerUnit: "2.00" }]
        };

        const result = mapErpBOrderChange(change);

        expect(result.mapped).toBe(true);
        if (result.mapped) {
            expect(result.value.canonicalOrder.declaredTotalAmount).toBe("2.46");
        }
    });

    it.each(INVALID_IDENTIFIER_CHANGES)(
        "rejects identifiers that the canonical core would reject",
        (change) => {
            expect(mapErpBOrderChange(change)).toEqual({
                mapped: false,
                reason: "invalid_identifier"
            });
        }
    );

    it("rejects a currency unsupported by the canonical core", () => {
        expect(mapErpBOrderChange({ ...VALID_CHANGE, currencyCode: "JPY" })).toEqual({
            mapped: false,
            reason: "unsupported_currency"
        });
    });

    it("rejects duplicate provider position identifiers", () => {
        const change: ErpBOrderChangePayload = {
            ...VALID_CHANGE,
            declaredTotal: "59.97",
            positions: [
                ...VALID_CHANGE.positions,
                {
                    positionId: "1",
                    articleNumber: "SKU-BOOK-2",
                    units: "1",
                    pricePerUnit: "19.99"
                }
            ]
        };

        expect(mapErpBOrderChange(change)).toEqual({
            mapped: false,
            reason: "duplicate_position_id"
        });
    });

    it("rejects a zero quantity", () => {
        const change: ErpBOrderChangePayload = {
            ...VALID_CHANGE,
            declaredTotal: "0.00",
            positions: [{ ...VALID_POSITION, units: "0.0000" }]
        };

        expect(mapErpBOrderChange(change)).toEqual({
            mapped: false,
            reason: "non_positive_quantity"
        });
    });

    it("rejects a declared total that differs from rounded line totals", () => {
        expect(mapErpBOrderChange({ ...VALID_CHANGE, declaredTotal: "39.99" })).toEqual({
            mapped: false,
            reason: "total_mismatch"
        });
    });
});
