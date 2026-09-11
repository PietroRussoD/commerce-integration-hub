import { describe, expect, it } from "vitest";

import {
    decodeDeliveryCursor,
    encodeDeliveryCursor,
    InvalidDeliveryCursorError
} from "./delivery-cursor.js";

const cursor = {
    deliveryId: "0199037b-6400-7000-8000-000000000901",
    receivedAt: "2026-09-11T08:00:00.123456Z"
};

describe("delivery cursor codec", () => {
    it("round-trips a precise delivery cursor without exposing its structure", () => {
        const encoded = encodeDeliveryCursor(cursor);

        expect(encoded).not.toContain(cursor.deliveryId);
        expect(decodeDeliveryCursor(encoded)).toEqual(cursor);
    });

    it.each([
        "",
        "a".repeat(513),
        "not valid base64url",
        "AB",
        Buffer.from("not-json").toString("base64url"),
        Buffer.from(JSON.stringify(null)).toString("base64url"),
        Buffer.from(JSON.stringify([])).toString("base64url"),
        Buffer.from(JSON.stringify({ v: 2, i: cursor.deliveryId, r: cursor.receivedAt })).toString(
            "base64url"
        ),
        Buffer.from(JSON.stringify({ v: 1, i: cursor.deliveryId })).toString("base64url"),
        Buffer.from(JSON.stringify({ v: 1, i: "invalid", r: cursor.receivedAt })).toString(
            "base64url"
        ),
        Buffer.from(JSON.stringify({ ...cursor, extra: true })).toString("base64url")
    ])("rejects the invalid opaque cursor %#", (encoded) => {
        expect(() => decodeDeliveryCursor(encoded)).toThrow(InvalidDeliveryCursorError);
    });
});
