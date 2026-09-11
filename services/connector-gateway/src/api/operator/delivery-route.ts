import type { FastifyPluginCallback, FastifyReply } from "fastify";

import type {
    GetInboundDeliveryUseCase,
    InboundDeliveryAttemptSummary,
    InboundDeliveryDetail
} from "../../application/deliveries/get-inbound-delivery.js";
import type {
    DeliveryProvider,
    InboundDeliveryStatus,
    InboundDeliverySummary,
    ListInboundDeliveriesUseCase
} from "../../application/deliveries/list-inbound-deliveries.js";
import {
    configureOperatorAuthorization,
    type OperatorAuthorizationOptions
} from "../../infrastructure/security/operator-authorization.js";
import {
    decodeDeliveryCursor,
    encodeDeliveryCursor,
    InvalidDeliveryCursorError
} from "./delivery-cursor.js";
import {
    commonOperatorErrorSchemas,
    deliveryDetailResponseSchema,
    deliveryListQuerySchema,
    deliveryListResponseSchema,
    deliveryPathParametersSchema,
    operatorJwtSecurity,
    problemDetailsSchema
} from "./delivery-route-schemas.js";

const DEFAULT_PAGE_SIZE = 20;

interface DeliveryListQuery {
    readonly cursor?: string;
    readonly limit?: number;
    readonly provider?: DeliveryProvider;
    readonly status?: InboundDeliveryStatus;
}

interface DeliveryPathParameters {
    readonly deliveryId: string;
}

interface ProblemDetails {
    readonly detail: string;
    readonly status: number;
    readonly title: string;
    readonly type: string;
}

export interface OperatorDeliveryRouteOptions {
    readonly authorization: OperatorAuthorizationOptions;
    readonly getDelivery: GetInboundDeliveryUseCase;
    readonly listDeliveries: ListInboundDeliveriesUseCase;
}

export const operatorDeliveryRoute: FastifyPluginCallback<OperatorDeliveryRouteOptions> = (
    application,
    { authorization, getDelivery, listDeliveries },
    done
) => {
    const requireRole = configureOperatorAuthorization(application, authorization);

    application.setErrorHandler((error, request, reply) => {
        if (hasValidationErrors(error) || error instanceof InvalidDeliveryCursorError) {
            sendProblem(reply, 400, {
                type: "urn:problem:operator-request-validation",
                title: "Operator request validation failed",
                detail: "The operator request parameters are invalid"
            });
            return;
        }
        request.log.error({ err: error }, "Operator delivery request failed");
        sendProblem(reply, 503, {
            type: "urn:problem:gateway-unavailable",
            title: "Gateway unavailable",
            detail: "The operator delivery request could not be completed"
        });
    });

    application.get<{ Querystring: DeliveryListQuery }>(
        "/api/v1/operator/deliveries",
        {
            preHandler: requireRole("operator"),
            schema: {
                security: operatorJwtSecurity,
                querystring: deliveryListQuerySchema,
                response: {
                    200: deliveryListResponseSchema,
                    ...commonOperatorErrorSchemas
                }
            }
        },
        async (request) => {
            const page = await listDeliveries({
                ...(request.query.cursor === undefined
                    ? {}
                    : { cursor: decodeDeliveryCursor(request.query.cursor) }),
                limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
                ...(request.query.provider === undefined
                    ? {}
                    : { provider: request.query.provider }),
                ...(request.query.status === undefined
                    ? {}
                    : { statuses: [request.query.status] })
            });
            return {
                items: page.items.map(toDeliverySummaryResponse),
                nextCursor:
                    page.nextCursor === null ? null : encodeDeliveryCursor(page.nextCursor)
            };
        }
    );

    application.get<{ Params: DeliveryPathParameters }>(
        "/api/v1/operator/deliveries/:deliveryId",
        {
            preHandler: requireRole("operator"),
            schema: {
                security: operatorJwtSecurity,
                params: deliveryPathParametersSchema,
                response: {
                    200: deliveryDetailResponseSchema,
                    404: problemDetailsSchema,
                    ...commonOperatorErrorSchemas
                }
            }
        },
        async (request, reply) => {
            const delivery = await getDelivery(request.params.deliveryId);
            if (delivery === null) {
                reply.code(404);
                return {
                    type: "urn:problem:delivery-not-found",
                    title: "Delivery not found",
                    status: 404,
                    detail: "The requested inbound delivery does not exist"
                };
            }
            return toDeliveryDetailResponse(delivery);
        }
    );

    done();
};

function toDeliverySummaryResponse(delivery: InboundDeliverySummary) {
    return {
        attemptCount: delivery.attemptCount,
        completedAt: toNullableInstant(delivery.completedAt),
        correlationId: delivery.correlationId,
        deliveryId: delivery.deliveryId,
        errorCode: delivery.errorCode,
        externalEventId: delivery.externalEventId,
        lastCoreOrderId: delivery.lastCoreOrderId,
        lastHttpStatus: delivery.lastHttpStatus,
        provider: delivery.provider,
        receivedAt: delivery.receivedAt.toISOString(),
        sourceSystem: delivery.sourceSystem,
        status: delivery.status,
        updatedAt: delivery.updatedAt.toISOString()
    };
}

function toDeliveryDetailResponse(delivery: InboundDeliveryDetail) {
    return {
        ...toDeliverySummaryResponse(delivery),
        attempts: delivery.attempts.map(toDeliveryAttemptResponse),
        connectorId: delivery.connectorId,
        connectorMode: delivery.connectorMode,
        connectorStatus: delivery.connectorStatus,
        mappingVersion: delivery.mappingVersion,
        nextAttemptAt: delivery.nextAttemptAt.toISOString(),
        payloadExpiresAt: delivery.payloadExpiresAt.toISOString(),
        payloadRetained: delivery.payloadRetained,
        safeErrorMessage: delivery.safeErrorMessage
    };
}

function toDeliveryAttemptResponse(attempt: InboundDeliveryAttemptSummary) {
    return {
        attemptId: attempt.attemptId,
        attemptNumber: attempt.attemptNumber,
        completedAt: toNullableInstant(attempt.completedAt),
        durationMilliseconds: attempt.durationMilliseconds,
        errorCode: attempt.errorCode,
        httpStatus: attempt.httpStatus,
        outcome: attempt.outcome,
        safeErrorMessage: attempt.safeErrorMessage,
        startedAt: attempt.startedAt.toISOString(),
        traceId: attempt.traceId
    };
}

function toNullableInstant(value: Date | null): string | null {
    return value?.toISOString() ?? null;
}

function hasValidationErrors(error: unknown): boolean {
    return typeof error === "object" && error !== null && "validation" in error;
}

function sendProblem(
    reply: FastifyReply,
    status: 400 | 503,
    problem: Omit<ProblemDetails, "status">
): void {
    reply.code(status).type("application/problem+json").send({ ...problem, status });
}
