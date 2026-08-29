import { describe, expect, it } from "vitest";

import {
    type Environment,
    readMarketplaceAWebhookSecurityConfiguration
} from "./webhook-security-configuration.js";

const CURRENT_SECRET = Buffer.alloc(32, 0xa5).toString("base64");
const PREVIOUS_SECRET = Buffer.alloc(32, 0x5a).toString("base64");
const REQUIRED_ENVIRONMENT = {
    MARKETPLACE_A_WEBHOOK_CURRENT_KEY_ID: "current-key",
    MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64: CURRENT_SECRET
};

describe("MARKETPLACE_A webhook security configuration", () => {
    it("reads the current key and applies the default timestamp tolerance", () => {
        const configuration = readMarketplaceAWebhookSecurityConfiguration(REQUIRED_ENVIRONMENT);

        expect(configuration).toEqual({
            currentKey: {
                keyId: "current-key",
                secret: new Uint8Array(32).fill(0xa5)
            },
            timestampToleranceSeconds: 300
        });
    });

    it("reads a complete previous key rotation configuration", () => {
        const configuration = readMarketplaceAWebhookSecurityConfiguration({
            ...REQUIRED_ENVIRONMENT,
            MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ID: "previous-key",
            MARKETPLACE_A_WEBHOOK_PREVIOUS_SECRET_BASE64: PREVIOUS_SECRET,
            MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ACCEPTED_UNTIL: "2026-08-30T12:30:00.000Z",
            MARKETPLACE_A_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: "120"
        });

        expect(configuration).toEqual({
            currentKey: {
                keyId: "current-key",
                secret: new Uint8Array(32).fill(0xa5)
            },
            previousKey: {
                keyId: "previous-key",
                secret: new Uint8Array(32).fill(0x5a),
                acceptedUntilMilliseconds: 1_788_093_000_000
            },
            timestampToleranceSeconds: 120
        });
    });

    it.each([
        "MARKETPLACE_A_WEBHOOK_CURRENT_KEY_ID",
        "MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64"
    ])("requires %s", (missingName) => {
        const environment = { ...REQUIRED_ENVIRONMENT } as Environment;
        delete (environment as Record<string, string | undefined>)[missingName];

        expect(() => readMarketplaceAWebhookSecurityConfiguration(environment)).toThrow(
            `${missingName} is required`
        );
    });

    it.each([Buffer.alloc(31).toString("base64"), "not-base64"])(
        "rejects a short or non-canonical current secret",
        (secret) => {
            expect(() =>
                readMarketplaceAWebhookSecurityConfiguration({
                    ...REQUIRED_ENVIRONMENT,
                    MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64: secret
                })
            ).toThrow(
                "MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64 must contain at least 32 bytes in canonical Base64 encoding"
            );
        }
    );

    it.each(["-1", "1.5", "030", "301", "9007199254740992"])(
        "rejects an unsafe timestamp tolerance: %s",
        (tolerance) => {
            expect(() =>
                readMarketplaceAWebhookSecurityConfiguration({
                    ...REQUIRED_ENVIRONMENT,
                    MARKETPLACE_A_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: tolerance
                })
            ).toThrow(
                "MARKETPLACE_A_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS must be an integer between 0 and 300"
            );
        }
    );

    it("requires all previous key rotation values together", () => {
        expect(() =>
            readMarketplaceAWebhookSecurityConfiguration({
                ...REQUIRED_ENVIRONMENT,
                MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ID: "previous-key"
            })
        ).toThrow(
            "MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ID, MARKETPLACE_A_WEBHOOK_PREVIOUS_SECRET_BASE64, and MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ACCEPTED_UNTIL must be configured together"
        );
    });

    it.each(["2026-08-30", "2026-08-30T12:30:00+02:00", "2026-02-30T12:30:00Z"])(
        "rejects a non-canonical rotation deadline: %s",
        (acceptedUntil) => {
            expect(() =>
                readMarketplaceAWebhookSecurityConfiguration({
                    ...REQUIRED_ENVIRONMENT,
                    MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ID: "previous-key",
                    MARKETPLACE_A_WEBHOOK_PREVIOUS_SECRET_BASE64: PREVIOUS_SECRET,
                    MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ACCEPTED_UNTIL: acceptedUntil
                })
            ).toThrow(
                "MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ACCEPTED_UNTIL must be a canonical UTC ISO-8601 instant"
            );
        }
    );
});
