import type { MarketplaceAWebhookSignatureVerifier } from "./webhook-signature-verifier.js";

const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface MarketplaceAWebhookVerificationKey {
    keyId: string;
    verifySignature: MarketplaceAWebhookSignatureVerifier;
}

export interface MarketplaceAPreviousWebhookVerificationKey
    extends MarketplaceAWebhookVerificationKey {
    acceptedUntilMilliseconds: number;
}

export interface MarketplaceAWebhookVerifierRegistryConfiguration {
    currentKey: MarketplaceAWebhookVerificationKey;
    previousKey?: MarketplaceAPreviousWebhookVerificationKey;
    currentTimeMilliseconds: () => number;
}

export type MarketplaceAWebhookSignatureVerifierResolver = (
    keyId: string | undefined
) => MarketplaceAWebhookSignatureVerifier | undefined;

export function createMarketplaceAWebhookSignatureVerifierResolver({
    currentKey,
    previousKey,
    currentTimeMilliseconds
}: MarketplaceAWebhookVerifierRegistryConfiguration): MarketplaceAWebhookSignatureVerifierResolver {
    validateKeyId(currentKey.keyId);

    if (previousKey !== undefined) {
        validateKeyId(previousKey.keyId);
        if (previousKey.keyId === currentKey.keyId) {
            throw new Error("Current and previous webhook key IDs must be different");
        }
        if (
            !Number.isSafeInteger(previousKey.acceptedUntilMilliseconds) ||
            previousKey.acceptedUntilMilliseconds < 0
        ) {
            throw new Error("Previous webhook key expiry must be a non-negative safe integer");
        }
    }

    return (keyId) => {
        if (keyId === currentKey.keyId) {
            return currentKey.verifySignature;
        }

        if (
            previousKey !== undefined &&
            keyId === previousKey.keyId &&
            currentTimeMilliseconds() <= previousKey.acceptedUntilMilliseconds
        ) {
            return previousKey.verifySignature;
        }

        return undefined;
    };
}

function validateKeyId(keyId: string): void {
    if (!KEY_ID_PATTERN.test(keyId)) {
        throw new Error("Webhook key ID has an invalid format");
    }
}
