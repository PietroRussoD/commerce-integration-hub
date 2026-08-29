import type { MarketplaceAWebhookSignatureVerifierResolver } from "./webhook-signature-verifier-registry.js";
import type { MarketplaceAWebhookTimestampValidator } from "./webhook-timestamp-validator.js";

export interface MarketplaceAWebhookAuthenticationInput {
    keyId: string | undefined;
    rawBody: Uint8Array;
    signatureHeader: string | undefined;
    timestamp: string | undefined;
}

export type MarketplaceAWebhookAuthenticationResult =
    | { authenticated: true }
    | {
          authenticated: false;
          reason: "invalid_timestamp" | "unknown_key" | "invalid_signature";
      };

export interface MarketplaceAWebhookAuthenticatorDependencies {
    resolveSignatureVerifier: MarketplaceAWebhookSignatureVerifierResolver;
    validateTimestamp: MarketplaceAWebhookTimestampValidator;
}

export type MarketplaceAWebhookAuthenticator = (
    input: MarketplaceAWebhookAuthenticationInput
) => MarketplaceAWebhookAuthenticationResult;

export function createMarketplaceAWebhookAuthenticator({
    resolveSignatureVerifier,
    validateTimestamp
}: MarketplaceAWebhookAuthenticatorDependencies): MarketplaceAWebhookAuthenticator {
    return ({ keyId, rawBody, signatureHeader, timestamp }) => {
        if (timestamp === undefined || !validateTimestamp(timestamp)) {
            return { authenticated: false, reason: "invalid_timestamp" };
        }

        const verifySignature = resolveSignatureVerifier(keyId);
        if (verifySignature === undefined) {
            return { authenticated: false, reason: "unknown_key" };
        }

        if (!verifySignature({ rawBody, signatureHeader, timestamp })) {
            return { authenticated: false, reason: "invalid_signature" };
        }

        return { authenticated: true };
    };
}
