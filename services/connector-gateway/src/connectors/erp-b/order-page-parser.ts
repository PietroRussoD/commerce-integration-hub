import { Ajv, type JSONSchemaType } from "ajv";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const DECIMAL_VALUE_PATTERN = "^(?:0|[1-9][0-9]{0,14})(?:\\.[0-9]{1,4})?$";
const DECIMAL_AMOUNT_PATTERN = "^(?:0|[1-9][0-9]{0,16})(?:\\.[0-9]{1,2})?$";

export interface ErpBOrderPositionPayload {
    positionId: string;
    articleNumber: string;
    units: string;
    pricePerUnit: string;
}

export interface ErpBOrderChangePayload {
    changeId: string;
    orderCode: string;
    currencyCode: string;
    declaredTotal: string;
    positions: ErpBOrderPositionPayload[];
}

export interface ErpBOrderPagePayload {
    items: ErpBOrderChangePayload[];
    nextCursor: string;
    hasMore: boolean;
}

export type ErpBOrderPageParseResult =
    | { valid: true; page: ErpBOrderPagePayload }
    | { valid: false; reason: "malformed_json" | "schema_invalid" };

const POSITION_SCHEMA: JSONSchemaType<ErpBOrderPositionPayload> = {
    type: "object",
    additionalProperties: false,
    required: ["positionId", "articleNumber", "units", "pricePerUnit"],
    properties: {
        positionId: { type: "string", minLength: 1, maxLength: 150, pattern: ".*\\S.*" },
        articleNumber: { type: "string", minLength: 1, maxLength: 100, pattern: ".*\\S.*" },
        units: { type: "string", pattern: DECIMAL_VALUE_PATTERN },
        pricePerUnit: { type: "string", pattern: DECIMAL_AMOUNT_PATTERN }
    }
};

const ORDER_CHANGE_SCHEMA: JSONSchemaType<ErpBOrderChangePayload> = {
    type: "object",
    additionalProperties: false,
    required: ["changeId", "orderCode", "currencyCode", "declaredTotal", "positions"],
    properties: {
        changeId: {
            type: "string",
            minLength: 1,
            maxLength: 128,
            pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$"
        },
        orderCode: { type: "string", minLength: 1, maxLength: 100, pattern: ".*\\S.*" },
        currencyCode: { type: "string", pattern: "^[A-Z]{3}$" },
        declaredTotal: { type: "string", pattern: DECIMAL_AMOUNT_PATTERN },
        positions: {
            type: "array",
            minItems: 1,
            maxItems: 500,
            items: POSITION_SCHEMA
        }
    }
};

export const ERP_B_ORDER_PAGE_SCHEMA: JSONSchemaType<ErpBOrderPagePayload> = {
    type: "object",
    additionalProperties: false,
    required: ["items", "nextCursor", "hasMore"],
    properties: {
        items: {
            type: "array",
            maxItems: 100,
            items: ORDER_CHANGE_SCHEMA
        },
        nextCursor: { type: "string", minLength: 1, maxLength: 512, pattern: ".*\\S.*" },
        hasMore: { type: "boolean" }
    }
};

const ajv = new Ajv({
    allErrors: false,
    coerceTypes: false,
    removeAdditional: false,
    strict: true,
    useDefaults: false
});
const validatePage = ajv.compile<ErpBOrderPagePayload>(ERP_B_ORDER_PAGE_SCHEMA);

export function parseErpBOrderPage(rawBody: Uint8Array): ErpBOrderPageParseResult {
    let candidate: unknown;
    try {
        candidate = JSON.parse(UTF8_DECODER.decode(rawBody));
    } catch {
        return { valid: false, reason: "malformed_json" };
    }

    return validatePage(candidate)
        ? { valid: true, page: candidate }
        : { valid: false, reason: "schema_invalid" };
}
