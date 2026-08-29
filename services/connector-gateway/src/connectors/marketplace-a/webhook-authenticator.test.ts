import { describe, expect, it, vi } from "vitest";

import type { MarketplaceAWebhookSignatureInput } from "./webhook-signature-verifier.js";
import { createMarketplaceAWebhookAuthenticator } from "./webhook-authenticator.js";

const RAW_BODY = Buffer.from('{"eventId":"evt-42"}', "utf8");
const VALID_INPUT = {
    keyId: "current-key",
    rawBody: RAW_BODY,
    signatureHeader: `v1=${"00".repeat(32)}`,
    timestamp: "1784073600"
};

describe("MARKETPLACE_A webhook authenticator", () => {
    it("authenticates when the timestamp, key and signature are valid", () => {
        const validateTimestamp = vi
            .fn<(timestamp: string) => boolean>()
            .mockReturnValue(true);
        const verifySignature = vi
            .fn<(input: MarketplaceAWebhookSignatureInput) => boolean>()
            .mockReturnValue(true);
        const resolveSignatureVerifier = vi
            .fn<(keyId: string | undefined) => typeof verifySignature>()
            .mockReturnValue(verifySignature);
        const authenticate = createMarketplaceAWebhookAuthenticator({
            resolveSignatureVerifier,
            validateTimestamp
        });

        expect(authenticate(VALID_INPUT)).toEqual({ authenticated: true });
        expect(validateTimestamp).toHaveBeenCalledWith(VALID_INPUT.timestamp);
        expect(resolveSignatureVerifier).toHaveBeenCalledWith(VALID_INPUT.keyId);
        expect(verifySignature).toHaveBeenCalledWith({
            rawBody: RAW_BODY,
            signatureHeader: VALID_INPUT.signatureHeader,
            timestamp: VALID_INPUT.timestamp
        });
    });

    it.each([undefined, "1784073299"])(
        "rejects an invalid timestamp without resolving a key: %s",
        (timestamp) => {
            const validateTimestamp = vi
                .fn<(timestamp: string) => boolean>()
                .mockReturnValue(false);
            const resolveSignatureVerifier = vi.fn(() => undefined);
            const authenticate = createMarketplaceAWebhookAuthenticator({
                resolveSignatureVerifier,
                validateTimestamp
            });

            expect(authenticate({ ...VALID_INPUT, timestamp })).toEqual({
                authenticated: false,
                reason: "invalid_timestamp"
            });
            expect(resolveSignatureVerifier).not.toHaveBeenCalled();
            if (timestamp === undefined) {
                expect(validateTimestamp).not.toHaveBeenCalled();
            } else {
                expect(validateTimestamp).toHaveBeenCalledWith(timestamp);
            }
        }
    );

    it("rejects an unknown key without verifying the signature", () => {
        const authenticate = createMarketplaceAWebhookAuthenticator({
            resolveSignatureVerifier: () => undefined,
            validateTimestamp: () => true
        });

        expect(authenticate({ ...VALID_INPUT, keyId: "unknown-key" })).toEqual({
            authenticated: false,
            reason: "unknown_key"
        });
    });

    it("rejects an invalid signature", () => {
        const authenticate = createMarketplaceAWebhookAuthenticator({
            resolveSignatureVerifier: () => () => false,
            validateTimestamp: () => true
        });

        expect(authenticate(VALID_INPUT)).toEqual({
            authenticated: false,
            reason: "invalid_signature"
        });
    });
});
