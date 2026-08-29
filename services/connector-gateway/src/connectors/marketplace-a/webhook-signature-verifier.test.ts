import { describe, expect, it } from "vitest";

import { createMarketplaceAWebhookSignatureVerifier } from "./webhook-signature-verifier.js";

const SECRET = Buffer.from(
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    "hex"
);
const TIMESTAMP = "1784073600";
const RAW_BODY = Buffer.from('{"eventId":"evt-42"}', "utf8");
// Precomputed with OpenSSL to keep the expected value independent of Node's crypto API.
const VALID_SIGNATURE = "v1=9c5121d6f5e2f7e8bc9dbabf3f68b22005a1e642adb6c35c9c00be47080114db";

describe("MARKETPLACE_A webhook signature verifier", () => {
    const verify = createMarketplaceAWebhookSignatureVerifier(SECRET);

    it("accepts the precomputed HMAC-SHA-256 signature", () => {
        expect(
            verify({
                rawBody: RAW_BODY,
                signatureHeader: VALID_SIGNATURE,
                timestamp: TIMESTAMP
            })
        ).toBe(true);
    });

    it("rejects a signature when any raw body byte changes", () => {
        expect(
            verify({
                rawBody: Buffer.from('{ "eventId":"evt-42"}', "utf8"),
                signatureHeader: VALID_SIGNATURE,
                timestamp: TIMESTAMP
            })
        ).toBe(false);
    });

    it("rejects a signature created for another timestamp", () => {
        expect(
            verify({
                rawBody: RAW_BODY,
                signatureHeader: VALID_SIGNATURE,
                timestamp: "1784073601"
            })
        ).toBe(false);
    });

    it.each([
        undefined,
        "",
        "9c5121d6f5e2f7e8bc9dbabf3f68b22005a1e642adb6c35c9c00be47080114db",
        "v2=9c5121d6f5e2f7e8bc9dbabf3f68b22005a1e642adb6c35c9c00be47080114db",
        "v1=9C5121D6F5E2F7E8BC9DBABF3F68B22005A1E642ADB6C35C9C00BE47080114DB",
        "v1=0011"
    ])("rejects a malformed signature header: %s", (signatureHeader) => {
        expect(verify({ rawBody: RAW_BODY, signatureHeader, timestamp: TIMESTAMP })).toBe(false);
    });
});
