import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MarketplaceAWebhookSecurityConfiguration } from "./webhook-security-configuration.js";
import { createConfiguredMarketplaceAWebhookAuthenticator } from "./webhook-security.js";

const CURRENT_SECRET = new Uint8Array(32).fill(0x11);
const PREVIOUS_SECRET = new Uint8Array(32).fill(0x22);
const TIMESTAMP = "1784073600";
const CURRENT_TIME_MILLISECONDS = 1_784_073_600_500;
const ROTATION_DEADLINE_MILLISECONDS = CURRENT_TIME_MILLISECONDS + 1_000;
const RAW_BODY = Buffer.from('{"eventId":"evt-42"}', "utf8");

describe("configured MARKETPLACE_A webhook security", () => {
    it("authenticates a current-key signature", () => {
        const authenticate = createConfiguredMarketplaceAWebhookAuthenticator(
            currentOnlyConfiguration(),
            () => CURRENT_TIME_MILLISECONDS
        );

        expect(
            authenticate({
                keyId: "current-key",
                rawBody: RAW_BODY,
                signatureHeader: sign(CURRENT_SECRET, TIMESTAMP, RAW_BODY),
                timestamp: TIMESTAMP
            })
        ).toEqual({ authenticated: true });
    });

    it("rejects a signature produced with a different configured key", () => {
        const authenticate = createConfiguredMarketplaceAWebhookAuthenticator(
            rotatingConfiguration(),
            () => CURRENT_TIME_MILLISECONDS
        );

        expect(
            authenticate({
                keyId: "current-key",
                rawBody: RAW_BODY,
                signatureHeader: sign(PREVIOUS_SECRET, TIMESTAMP, RAW_BODY),
                timestamp: TIMESTAMP
            })
        ).toEqual({ authenticated: false, reason: "invalid_signature" });
    });

    it("accepts the previous key through its rotation deadline", () => {
        const configuration = rotatingConfiguration();
        const authenticate = createConfiguredMarketplaceAWebhookAuthenticator(
            configuration,
            () => ROTATION_DEADLINE_MILLISECONDS
        );

        expect(
            authenticate({
                keyId: "previous-key",
                rawBody: RAW_BODY,
                signatureHeader: sign(PREVIOUS_SECRET, TIMESTAMP, RAW_BODY),
                timestamp: TIMESTAMP
            })
        ).toEqual({ authenticated: true });
    });

    it("rejects the previous key after its rotation deadline", () => {
        const configuration = rotatingConfiguration();
        const authenticate = createConfiguredMarketplaceAWebhookAuthenticator(
            configuration,
            () => ROTATION_DEADLINE_MILLISECONDS + 1
        );

        expect(
            authenticate({
                keyId: "previous-key",
                rawBody: RAW_BODY,
                signatureHeader: sign(PREVIOUS_SECRET, TIMESTAMP, RAW_BODY),
                timestamp: TIMESTAMP
            })
        ).toEqual({ authenticated: false, reason: "unknown_key" });
    });

    it("applies the configured timestamp tolerance", () => {
        const authenticate = createConfiguredMarketplaceAWebhookAuthenticator(
            { ...currentOnlyConfiguration(), timestampToleranceSeconds: 120 },
            () => CURRENT_TIME_MILLISECONDS + 121_000
        );

        expect(
            authenticate({
                keyId: "current-key",
                rawBody: RAW_BODY,
                signatureHeader: sign(CURRENT_SECRET, TIMESTAMP, RAW_BODY),
                timestamp: TIMESTAMP
            })
        ).toEqual({ authenticated: false, reason: "invalid_timestamp" });
    });
});

function currentOnlyConfiguration(): MarketplaceAWebhookSecurityConfiguration {
    return {
        currentKey: {
            keyId: "current-key",
            secret: CURRENT_SECRET
        },
        timestampToleranceSeconds: 300
    };
}

function rotatingConfiguration(): MarketplaceAWebhookSecurityConfiguration {
    return {
        ...currentOnlyConfiguration(),
        previousKey: {
            keyId: "previous-key",
            secret: PREVIOUS_SECRET,
            acceptedUntilMilliseconds: ROTATION_DEADLINE_MILLISECONDS
        }
    };
}

function sign(secret: Uint8Array, timestamp: string, rawBody: Uint8Array): string {
    const signature = createHmac("sha256", secret)
        .update(timestamp, "utf8")
        .update(".", "utf8")
        .update(rawBody)
        .digest("hex");
    return `v1=${signature}`;
}
