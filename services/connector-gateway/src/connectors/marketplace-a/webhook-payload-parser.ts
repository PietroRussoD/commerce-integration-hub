import { Ajv, type JSONSchemaType } from "ajv";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export interface MarketplaceAOrderLinePayload {
    lineNumber: string;
    productCode: string;
    quantity: number;
    unitPriceCents: number;
}

export interface MarketplaceAOrderPayload {
    orderNumber: string;
    currency: string;
    totalCents: number;
    lines: MarketplaceAOrderLinePayload[];
}

export interface MarketplaceAWebhookPayload {
    eventId: string;
    eventType: string;
    order: MarketplaceAOrderPayload;
}

export type MarketplaceAWebhookPayloadParseResult =
    | { valid: true; payload: MarketplaceAWebhookPayload }
    | { valid: false; reason: "malformed_json" | "schema_invalid" };

const ORDER_LINE_SCHEMA: JSONSchemaType<MarketplaceAOrderLinePayload> = {
    type: "object",
    additionalProperties: false,
    required: ["lineNumber", "productCode", "quantity", "unitPriceCents"],
    properties: {
        lineNumber: { type: "string", minLength: 1, maxLength: 40, pattern: ".*\\S.*" },
        productCode: { type: "string", minLength: 1, maxLength: 100, pattern: ".*\\S.*" },
        quantity: { type: "integer", minimum: 1, maximum: 1_000_000 },
        unitPriceCents: { type: "integer", minimum: 0, maximum: MAX_SAFE_INTEGER }
    }
};

export const MARKETPLACE_A_WEBHOOK_PAYLOAD_SCHEMA: JSONSchemaType<MarketplaceAWebhookPayload> = {
    type: "object",
    additionalProperties: false,
    required: ["eventId", "eventType", "order"],
    properties: {
        eventId: {
            type: "string",
            minLength: 1,
            maxLength: 128,
            pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$"
        },
        eventType: {
            type: "string",
            minLength: 3,
            maxLength: 64,
            pattern: "^[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9]*)+$"
        },
        order: {
            type: "object",
            additionalProperties: false,
            required: ["orderNumber", "currency", "totalCents", "lines"],
            properties: {
                orderNumber: {
                    type: "string",
                    minLength: 1,
                    maxLength: 100,
                    pattern: ".*\\S.*"
                },
                currency: { type: "string", pattern: "^[A-Z]{3}$" },
                totalCents: { type: "integer", minimum: 0, maximum: MAX_SAFE_INTEGER },
                lines: {
                    type: "array",
                    minItems: 1,
                    maxItems: 500,
                    items: ORDER_LINE_SCHEMA
                }
            }
        }
    }
};

const ajv = new Ajv({
    allErrors: false,
    coerceTypes: false,
    removeAdditional: false,
    strict: true,
    useDefaults: false
});
const validatePayload = ajv.compile<MarketplaceAWebhookPayload>(
    MARKETPLACE_A_WEBHOOK_PAYLOAD_SCHEMA
);

export function parseMarketplaceAWebhookPayload(
    rawBody: Uint8Array
): MarketplaceAWebhookPayloadParseResult {
    let candidate: unknown;
    try {
        candidate = JSON.parse(UTF8_DECODER.decode(rawBody));
    } catch {
        return { valid: false, reason: "malformed_json" };
    }

    return validatePayload(candidate)
        ? { valid: true, payload: candidate }
        : { valid: false, reason: "schema_invalid" };
}
