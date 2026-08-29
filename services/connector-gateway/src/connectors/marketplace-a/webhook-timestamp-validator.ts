const UNIX_TIMESTAMP_PATTERN = /^(0|[1-9][0-9]*)$/;

export interface MarketplaceAWebhookTimestampPolicy {
    currentTimeMilliseconds: () => number;
    toleranceSeconds: number;
}

export type MarketplaceAWebhookTimestampValidator = (timestamp: string) => boolean;

export function createMarketplaceAWebhookTimestampValidator({
    currentTimeMilliseconds,
    toleranceSeconds
}: MarketplaceAWebhookTimestampPolicy): MarketplaceAWebhookTimestampValidator {
    if (!Number.isSafeInteger(toleranceSeconds) || toleranceSeconds < 0) {
        throw new Error("Webhook timestamp tolerance must be a non-negative safe integer");
    }

    return (timestamp) => {
        if (!UNIX_TIMESTAMP_PATTERN.test(timestamp)) {
            return false;
        }

        const timestampSeconds = Number(timestamp);
        if (!Number.isSafeInteger(timestampSeconds)) {
            return false;
        }

        const currentSeconds = Math.floor(currentTimeMilliseconds() / 1_000);
        return Math.abs(currentSeconds - timestampSeconds) <= toleranceSeconds;
    };
}
