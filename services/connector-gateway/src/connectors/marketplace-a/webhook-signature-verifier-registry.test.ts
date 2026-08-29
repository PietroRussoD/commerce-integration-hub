import { describe, expect, it } from "vitest";

import type { MarketplaceAWebhookSignatureVerifier } from "./webhook-signature-verifier.js";
import { createMarketplaceAWebhookSignatureVerifierResolver } from "./webhook-signature-verifier-registry.js";

const ROTATION_DEADLINE_MILLISECONDS = 1_784_073_600_000;
const CURRENT_VERIFIER: MarketplaceAWebhookSignatureVerifier = () => true;
const PREVIOUS_VERIFIER: MarketplaceAWebhookSignatureVerifier = () => false;

describe("MARKETPLACE_A webhook signature verifier registry", () => {
    it("resolves the current verifier", () => {
        const resolve = createResolver(ROTATION_DEADLINE_MILLISECONDS + 1);

        expect(resolve("current-key")).toBe(CURRENT_VERIFIER);
    });

    it.each([ROTATION_DEADLINE_MILLISECONDS - 1, ROTATION_DEADLINE_MILLISECONDS])(
        "resolves the previous verifier during its rotation window: %s",
        (currentTimeMilliseconds) => {
            const resolve = createResolver(currentTimeMilliseconds);

            expect(resolve("previous-key")).toBe(PREVIOUS_VERIFIER);
        }
    );

    it("rejects the previous verifier after its rotation window", () => {
        const resolve = createResolver(ROTATION_DEADLINE_MILLISECONDS + 1);

        expect(resolve("previous-key")).toBeUndefined();
    });

    it("supports a configuration without a previous key", () => {
        const resolve = createMarketplaceAWebhookSignatureVerifierResolver({
            currentKey: { keyId: "current-key", verifySignature: CURRENT_VERIFIER },
            currentTimeMilliseconds: () => ROTATION_DEADLINE_MILLISECONDS
        });

        expect(resolve("current-key")).toBe(CURRENT_VERIFIER);
        expect(resolve("previous-key")).toBeUndefined();
    });

    it.each([undefined, "", "unknown-key"])("rejects an unknown key ID: %s", (keyId) => {
        const resolve = createResolver(ROTATION_DEADLINE_MILLISECONDS);

        expect(resolve(keyId)).toBeUndefined();
    });

    it.each([" invalid", "invalid/key", "a".repeat(65)])(
        "rejects an invalid configured key ID: %s",
        (keyId) => {
            expect(() =>
                createMarketplaceAWebhookSignatureVerifierResolver({
                    currentKey: { keyId, verifySignature: CURRENT_VERIFIER },
                    currentTimeMilliseconds: () => ROTATION_DEADLINE_MILLISECONDS
                })
            ).toThrow("Webhook key ID has an invalid format");
        }
    );

    it("rejects equal current and previous key IDs", () => {
        expect(() =>
            createMarketplaceAWebhookSignatureVerifierResolver({
                currentKey: { keyId: "same-key", verifySignature: CURRENT_VERIFIER },
                previousKey: {
                    keyId: "same-key",
                    verifySignature: PREVIOUS_VERIFIER,
                    acceptedUntilMilliseconds: ROTATION_DEADLINE_MILLISECONDS
                },
                currentTimeMilliseconds: () => ROTATION_DEADLINE_MILLISECONDS
            })
        ).toThrow("Current and previous webhook key IDs must be different");
    });

    it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
        "rejects an invalid previous key expiry: %s",
        (acceptedUntilMilliseconds) => {
            expect(() =>
                createMarketplaceAWebhookSignatureVerifierResolver({
                    currentKey: { keyId: "current-key", verifySignature: CURRENT_VERIFIER },
                    previousKey: {
                        keyId: "previous-key",
                        verifySignature: PREVIOUS_VERIFIER,
                        acceptedUntilMilliseconds
                    },
                    currentTimeMilliseconds: () => ROTATION_DEADLINE_MILLISECONDS
                })
            ).toThrow("Previous webhook key expiry must be a non-negative safe integer");
        }
    );
});

function createResolver(currentTimeMilliseconds: number) {
    return createMarketplaceAWebhookSignatureVerifierResolver({
        currentKey: {
            keyId: "current-key",
            verifySignature: CURRENT_VERIFIER
        },
        previousKey: {
            keyId: "previous-key",
            verifySignature: PREVIOUS_VERIFIER,
            acceptedUntilMilliseconds: ROTATION_DEADLINE_MILLISECONDS
        },
        currentTimeMilliseconds: () => currentTimeMilliseconds
    });
}
