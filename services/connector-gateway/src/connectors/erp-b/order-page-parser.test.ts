import { describe, expect, it } from "vitest";

import { parseErpBOrderPage } from "./order-page-parser.js";

const VALID_POSITION = {
    positionId: "1",
    articleNumber: "SKU-BOOK-1",
    units: "2",
    pricePerUnit: "19.99"
};

const VALID_CHANGE = {
    changeId: "chg-00042",
    orderCode: "ERP-00042",
    currencyCode: "EUR",
    declaredTotal: "39.98",
    positions: [VALID_POSITION]
};

const VALID_PAGE = {
    items: [VALID_CHANGE],
    nextCursor: "opaque-cursor-43",
    hasMore: true
};

describe("ERP_B order page parser", () => {
    it("parses a valid provider page", () => {
        expect(parse(VALID_PAGE)).toEqual({ valid: true, page: VALID_PAGE });
    });

    it("accepts an empty page with a committed next cursor", () => {
        const page = { ...VALID_PAGE, items: [], hasMore: false };

        expect(parse(page)).toEqual({ valid: true, page });
    });

    it("accepts quantities with four fractional digits", () => {
        const page = withPosition({ units: "0.1250" });

        expect(parse(page)).toEqual({ valid: true, page });
    });

    it("rejects malformed JSON", () => {
        expect(parseErpBOrderPage(Buffer.from('{"items":', "utf8"))).toEqual({
            valid: false,
            reason: "malformed_json"
        });
    });

    it("rejects invalid UTF-8", () => {
        expect(parseErpBOrderPage(Buffer.from([0xff]))).toEqual({
            valid: false,
            reason: "malformed_json"
        });
    });

    it.each([
        { ...VALID_PAGE, unexpected: true },
        { ...VALID_PAGE, items: [{ ...VALID_CHANGE, unexpected: true }] },
        withPosition({ unexpected: true })
    ])("rejects unknown fields", (page) => {
        expect(parse(page)).toEqual({ valid: false, reason: "schema_invalid" });
    });

    it.each([
        { ...VALID_PAGE, nextCursor: "" },
        { ...VALID_PAGE, hasMore: "true" },
        { ...VALID_PAGE, items: [{ ...VALID_CHANGE, changeId: "bad change id" }] },
        { ...VALID_PAGE, items: [{ ...VALID_CHANGE, currencyCode: "eur" }] },
        { ...VALID_PAGE, items: [{ ...VALID_CHANGE, declaredTotal: "39.999" }] },
        { ...VALID_PAGE, items: [{ ...VALID_CHANGE, positions: [] }] },
        withPosition({ units: 2 }),
        withPosition({ units: "01" }),
        withPosition({ pricePerUnit: "19.999" })
    ])("rejects a page outside the provider schema", (page) => {
        expect(parse(page)).toEqual({ valid: false, reason: "schema_invalid" });
    });

    it("rejects more than 100 changes", () => {
        const page = {
            ...VALID_PAGE,
            items: Array.from({ length: 101 }, (_, index) => ({
                ...VALID_CHANGE,
                changeId: `chg-${String(index).padStart(5, "0")}`
            }))
        };

        expect(parse(page)).toEqual({ valid: false, reason: "schema_invalid" });
    });

    it("rejects more than 500 positions", () => {
        const page = {
            ...VALID_PAGE,
            items: [
                {
                    ...VALID_CHANGE,
                    positions: Array.from({ length: 501 }, (_, index) => ({
                        ...VALID_POSITION,
                        positionId: String(index + 1)
                    }))
                }
            ]
        };

        expect(parse(page)).toEqual({ valid: false, reason: "schema_invalid" });
    });
});

function parse(page: unknown) {
    return parseErpBOrderPage(Buffer.from(JSON.stringify(page), "utf8"));
}

function withPosition(overrides: Record<string, unknown>) {
    return {
        ...VALID_PAGE,
        items: [
            {
                ...VALID_CHANGE,
                positions: [{ ...VALID_POSITION, ...overrides }]
            }
        ]
    };
}
