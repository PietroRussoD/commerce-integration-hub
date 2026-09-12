import { inboundDeliveryStatuses } from "../../application/deliveries/list-inbound-deliveries.js";

export const operatorJwtSecurity = [{ operatorJwt: [] }] as const;

const providers = ["ERP_B", "MARKETPLACE_A"] as const;
const nullableString = { type: "string", nullable: true } as const;
const nullableInstant = { type: "string", format: "date-time", nullable: true } as const;

export const problemDetailsSchema = {
    type: "object",
    additionalProperties: false,
    required: ["type", "title", "status", "detail"],
    properties: {
        type: { type: "string" },
        title: { type: "string" },
        status: { type: "integer" },
        detail: { type: "string" }
    }
} as const;

export const commonOperatorErrorSchemas = {
    400: problemDetailsSchema,
    401: problemDetailsSchema,
    403: problemDetailsSchema,
    409: problemDetailsSchema,
    503: problemDetailsSchema
} as const;

export const deliveryListQuerySchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        cursor: { type: "string", minLength: 1, maxLength: 512 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        provider: { type: "string", enum: providers },
        status: { type: "string", enum: inboundDeliveryStatuses }
    }
} as const;

export const deliveryPathParametersSchema = {
    type: "object",
    additionalProperties: false,
    required: ["deliveryId"],
    properties: { deliveryId: { type: "string", format: "uuid" } }
} as const;

export const deliveryReplayHeadersSchema = {
    type: "object",
    additionalProperties: true,
    required: ["idempotency-key"],
    properties: {
        "idempotency-key": { type: "string", format: "uuid" }
    }
} as const;

export const deliveryReplayRequestSchema = {
    type: "object",
    additionalProperties: false,
    required: ["reason"],
    properties: {
        reason: {
            type: "string",
            minLength: 1,
            maxLength: 1_000,
            pattern: "^(?:\\S|\\S.*\\S)$"
        }
    }
} as const;

const deliverySummarySchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "attemptCount",
        "completedAt",
        "correlationId",
        "deliveryId",
        "errorCode",
        "externalEventId",
        "lastCoreOrderId",
        "lastHttpStatus",
        "provider",
        "receivedAt",
        "sourceSystem",
        "status",
        "updatedAt"
    ],
    properties: {
        attemptCount: { type: "integer", minimum: 0 },
        completedAt: nullableInstant,
        correlationId: { type: "string", format: "uuid", nullable: true },
        deliveryId: { type: "string", format: "uuid" },
        errorCode: nullableString,
        externalEventId: { type: "string" },
        lastCoreOrderId: { type: "string", format: "uuid", nullable: true },
        lastHttpStatus: { type: "integer", minimum: 100, maximum: 599, nullable: true },
        provider: { type: "string", enum: providers },
        receivedAt: { type: "string", format: "date-time" },
        sourceSystem: { type: "string" },
        status: { type: "string", enum: inboundDeliveryStatuses },
        updatedAt: { type: "string", format: "date-time" }
    }
} as const;

const deliveryAttemptSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "attemptId",
        "attemptNumber",
        "completedAt",
        "durationMilliseconds",
        "errorCode",
        "httpStatus",
        "outcome",
        "safeErrorMessage",
        "startedAt",
        "traceId"
    ],
    properties: {
        attemptId: { type: "string", format: "uuid" },
        attemptNumber: { type: "integer", minimum: 1 },
        completedAt: nullableInstant,
        durationMilliseconds: { type: "integer", minimum: 0, nullable: true },
        errorCode: nullableString,
        httpStatus: { type: "integer", minimum: 100, maximum: 599, nullable: true },
        outcome: {
            type: "string",
            enum: [
                "BLOCKED_CONFIGURATION",
                "DELIVERED",
                "PERMANENT_FAILURE",
                "RETRYABLE_FAILURE"
            ],
            nullable: true
        },
        safeErrorMessage: nullableString,
        startedAt: { type: "string", format: "date-time" },
        traceId: nullableString
    }
} as const;

export const deliveryListResponseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["items", "nextCursor"],
    properties: {
        items: { type: "array", items: deliverySummarySchema },
        nextCursor: { type: "string", nullable: true }
    }
} as const;

export const deliveryDetailResponseSchema = {
    ...deliverySummarySchema,
    required: [
        ...deliverySummarySchema.required,
        "attempts",
        "connectorId",
        "connectorMode",
        "connectorStatus",
        "mappingVersion",
        "nextAttemptAt",
        "payloadExpiresAt",
        "payloadRetained",
        "safeErrorMessage"
    ],
    properties: {
        ...deliverySummarySchema.properties,
        attempts: { type: "array", items: deliveryAttemptSchema },
        connectorId: { type: "string", format: "uuid" },
        connectorMode: { type: "string", enum: ["POLLING", "WEBHOOK"] },
        connectorStatus: {
            type: "string",
            enum: ["ACTIVE", "BLOCKED_CONFIGURATION", "DISABLED"]
        },
        mappingVersion: { type: "string" },
        nextAttemptAt: { type: "string", format: "date-time" },
        payloadExpiresAt: { type: "string", format: "date-time" },
        payloadRetained: { type: "boolean" },
        safeErrorMessage: nullableString
    }
} as const;

export const deliveryReplayResponseSchema = {
    type: "object",
    additionalProperties: false,
    required: ["commandId", "idempotent", "outcome"],
    properties: {
        commandId: { type: "string", format: "uuid" },
        idempotent: { type: "boolean" },
        outcome: { type: "string", enum: ["IN_PROGRESS", "REPLAYED"] }
    }
} as const;
