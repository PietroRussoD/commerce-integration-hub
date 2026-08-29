const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 300;
const MAX_TIMESTAMP_TOLERANCE_SECONDS = 300;
const MINIMUM_SECRET_BYTES = 32;
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const CURRENT_KEY_ID = "MARKETPLACE_A_WEBHOOK_CURRENT_KEY_ID";
const CURRENT_SECRET = "MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64";
const PREVIOUS_KEY_ID = "MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ID";
const PREVIOUS_SECRET = "MARKETPLACE_A_WEBHOOK_PREVIOUS_SECRET_BASE64";
const PREVIOUS_ACCEPTED_UNTIL = "MARKETPLACE_A_WEBHOOK_PREVIOUS_KEY_ACCEPTED_UNTIL";
const TIMESTAMP_TOLERANCE = "MARKETPLACE_A_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS";

export interface MarketplaceAWebhookConfiguredKey {
    keyId: string;
    secret: Uint8Array;
}

export interface MarketplaceAWebhookConfiguredPreviousKey
    extends MarketplaceAWebhookConfiguredKey {
    acceptedUntilMilliseconds: number;
}

export interface MarketplaceAWebhookSecurityConfiguration {
    currentKey: MarketplaceAWebhookConfiguredKey;
    previousKey?: MarketplaceAWebhookConfiguredPreviousKey;
    timestampToleranceSeconds: number;
}

export type Environment = Readonly<Record<string, string | undefined>>;

export function readMarketplaceAWebhookSecurityConfiguration(
    environment: Environment
): MarketplaceAWebhookSecurityConfiguration {
    const currentKey = {
        keyId: readRequired(environment, CURRENT_KEY_ID),
        secret: readSecret(environment, CURRENT_SECRET)
    };
    const timestampToleranceSeconds = readTimestampTolerance(environment[TIMESTAMP_TOLERANCE]);
    const previousKey = readPreviousKey(environment);

    return previousKey === undefined
        ? { currentKey, timestampToleranceSeconds }
        : { currentKey, previousKey, timestampToleranceSeconds };
}

function readPreviousKey(
    environment: Environment
): MarketplaceAWebhookConfiguredPreviousKey | undefined {
    const keyId = environment[PREVIOUS_KEY_ID];
    const secret = environment[PREVIOUS_SECRET];
    const acceptedUntil = environment[PREVIOUS_ACCEPTED_UNTIL];
    const configuredValues = [keyId, secret, acceptedUntil].filter(
        (value) => value !== undefined
    ).length;

    if (configuredValues === 0) {
        return undefined;
    }
    if (configuredValues !== 3) {
        throw new Error(
            `${PREVIOUS_KEY_ID}, ${PREVIOUS_SECRET}, and ${PREVIOUS_ACCEPTED_UNTIL} must be configured together`
        );
    }

    return {
        keyId: readRequired(environment, PREVIOUS_KEY_ID),
        secret: readSecret(environment, PREVIOUS_SECRET),
        acceptedUntilMilliseconds: readInstant(
            readRequired(environment, PREVIOUS_ACCEPTED_UNTIL)
        )
    };
}

function readRequired(environment: Environment, name: string): string {
    const value = environment[name];
    if (value === undefined || value.length === 0) {
        throw new Error(`${name} is required`);
    }
    return value;
}

function readSecret(environment: Environment, name: string): Uint8Array {
    const encoded = readRequired(environment, name);
    const decoded = Buffer.from(encoded, "base64");

    if (decoded.toString("base64") !== encoded || decoded.byteLength < MINIMUM_SECRET_BYTES) {
        throw new Error(`${name} must contain at least 32 bytes in canonical Base64 encoding`);
    }

    return Uint8Array.from(decoded);
}

function readTimestampTolerance(value: string | undefined): number {
    if (value === undefined) {
        return DEFAULT_TIMESTAMP_TOLERANCE_SECONDS;
    }
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) {
        throw new Error(`${TIMESTAMP_TOLERANCE} must be an integer between 0 and 300`);
    }

    const tolerance = Number(value);
    if (!Number.isSafeInteger(tolerance) || tolerance > MAX_TIMESTAMP_TOLERANCE_SECONDS) {
        throw new Error(`${TIMESTAMP_TOLERANCE} must be an integer between 0 and 300`);
    }
    return tolerance;
}

function readInstant(value: string): number {
    if (!ISO_INSTANT_PATTERN.test(value)) {
        throw new Error(`${PREVIOUS_ACCEPTED_UNTIL} must be a canonical UTC ISO-8601 instant`);
    }

    const milliseconds = Date.parse(value);
    const normalizedInput = value.includes(".") ? value : value.replace("Z", ".000Z");
    if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalizedInput) {
        throw new Error(`${PREVIOUS_ACCEPTED_UNTIL} must be a canonical UTC ISO-8601 instant`);
    }
    return milliseconds;
}
