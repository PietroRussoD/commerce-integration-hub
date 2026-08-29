import { createHmac, createSecretKey, timingSafeEqual } from "node:crypto";

const HMAC_ALGORITHM = "sha256";
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/;

export interface MarketplaceAWebhookSignatureInput {
    rawBody: Uint8Array;
    signatureHeader: string | undefined;
    timestamp: string;
}

export type MarketplaceAWebhookSignatureVerifier = (
    input: MarketplaceAWebhookSignatureInput
) => boolean;

export function createMarketplaceAWebhookSignatureVerifier(
    secret: Uint8Array
): MarketplaceAWebhookSignatureVerifier {
    const secretKey = createSecretKey(secret);

    return ({ rawBody, signatureHeader, timestamp }) => {
        const signatureHex = signatureHeader?.match(SIGNATURE_PATTERN)?.[1];
        if (signatureHex === undefined) {
            return false;
        }

        const expectedSignature = createHmac(HMAC_ALGORITHM, secretKey)
            .update(timestamp, "utf8")
            .update(".", "utf8")
            .update(rawBody)
            .digest();
        const presentedSignature = Buffer.from(signatureHex, "hex");

        return timingSafeEqual(expectedSignature, presentedSignature);
    };
}
