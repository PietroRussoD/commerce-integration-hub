import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    GetInboundDeliveryUseCase,
    InboundDeliveryDetail
} from "../../application/deliveries/get-inbound-delivery.js";
import type {
    InboundDeliveryPage,
    InboundDeliverySummary,
    ListInboundDeliveriesUseCase
} from "../../application/deliveries/list-inbound-deliveries.js";
import type { ReplayInboundDeliveryUseCase } from "../../application/deliveries/replay-inbound-delivery.js";
import { decodeDeliveryCursor, encodeDeliveryCursor } from "./delivery-cursor.js";
import { operatorDeliveryRoute } from "./delivery-route.js";
import type { OperatorAuthorizationOptions } from "../../infrastructure/security/operator-authorization.js";

const DELIVERY_ID = "0199037b-6400-7000-8000-000000000901";
const NEXT_DELIVERY_ID = "0199037b-6400-7000-8000-000000000902";
const applications: FastifyInstance[] = [];

afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe("operatorDeliveryRoute", () => {
    it("returns a safe delivery page with an opaque next cursor", async () => {
        const listDeliveries = vi
            .fn<ListInboundDeliveriesUseCase>()
            .mockResolvedValue(deliveryPage());
        const application = buildRoute({ listDeliveries });

        const response = await application.inject({
            method: "GET",
            url: "/api/v1/operator/deliveries"
        });

        expect(response.statusCode).toBe(200);
        expect(listDeliveries).toHaveBeenCalledWith({ limit: 20 });
        const body = response.json<{
            items: Record<string, unknown>[];
            nextCursor: string;
        }>();
        expect(body.items[0]).toMatchObject({
            completedAt: "2026-09-11T08:05:00.000Z",
            deliveryId: DELIVERY_ID,
            receivedAt: "2026-09-11T08:00:00.000Z",
            status: "EXHAUSTED"
        });
        expect(body.items[0]).not.toHaveProperty("safeErrorMessage");
        expect(decodeDeliveryCursor(body.nextCursor)).toEqual({
            deliveryId: NEXT_DELIVERY_ID,
            receivedAt: "2026-09-11T07:00:00.123456Z"
        });
    });

    it("decodes and delegates all bounded filters", async () => {
        const listDeliveries = vi
            .fn<ListInboundDeliveriesUseCase>()
            .mockResolvedValue({ items: [], nextCursor: null });
        const application = buildRoute({ listDeliveries });
        const cursor = encodeDeliveryCursor({
            deliveryId: NEXT_DELIVERY_ID,
            receivedAt: "2026-09-11T07:00:00.123456Z"
        });

        const response = await application.inject({
            method: "GET",
            url: `/api/v1/operator/deliveries?limit=5&provider=ERP_B&status=PERMANENT_FAILURE&cursor=${cursor}`
        });

        expect(response.statusCode).toBe(200);
        expect(listDeliveries).toHaveBeenCalledWith({
            cursor: {
                deliveryId: NEXT_DELIVERY_ID,
                receivedAt: "2026-09-11T07:00:00.123456Z"
            },
            limit: 5,
            provider: "ERP_B",
            statuses: ["PERMANENT_FAILURE"]
        });
        expect(response.json()).toEqual({ items: [], nextCursor: null });
    });

    it.each([
        "limit=0",
        "limit=101",
        "provider=UNKNOWN",
        "status=UNKNOWN",
        "unexpected=value",
        "cursor=not-an-opaque-cursor"
    ])("returns a stable 400 for invalid query %s", async (query) => {
        const listDeliveries = vi.fn<ListInboundDeliveriesUseCase>();
        const application = buildRoute({ listDeliveries });

        const response = await application.inject({
            method: "GET",
            url: `/api/v1/operator/deliveries?${query}`
        });

        expect(response.statusCode).toBe(400);
        expect(response.headers["content-type"]).toContain("application/problem+json");
        expect(response.json()).toEqual({
            type: "urn:problem:operator-request-validation",
            title: "Operator request validation failed",
            status: 400,
            detail: "The operator request parameters are invalid"
        });
        expect(listDeliveries).not.toHaveBeenCalled();
    });

    it("returns a safe delivery detail with its attempt history", async () => {
        const getDelivery = vi
            .fn<GetInboundDeliveryUseCase>()
            .mockResolvedValue(deliveryDetail());
        const application = buildRoute({ getDelivery });

        const response = await application.inject({
            method: "GET",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}`
        });

        expect(response.statusCode).toBe(200);
        expect(getDelivery).toHaveBeenCalledWith(DELIVERY_ID);
        expect(response.json()).toMatchObject({
            deliveryId: DELIVERY_ID,
            payloadExpiresAt: "2026-10-11T08:00:00.000Z",
            payloadRetained: true,
            safeErrorMessage: "Delivery attempts were exhausted",
            attempts: [
                {
                    attemptNumber: 1,
                    completedAt: null,
                    durationMilliseconds: null,
                    outcome: null
                }
            ]
        });
    });

    it("returns 404 when the delivery does not exist", async () => {
        const getDelivery = vi.fn<GetInboundDeliveryUseCase>().mockResolvedValue(null);
        const application = buildRoute({ getDelivery });

        const response = await application.inject({
            method: "GET",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}`
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
            type: "urn:problem:delivery-not-found",
            title: "Delivery not found",
            status: 404,
            detail: "The requested inbound delivery does not exist"
        });
    });

    it("returns 400 before the use case for an invalid delivery identity", async () => {
        const getDelivery = vi.fn<GetInboundDeliveryUseCase>();
        const application = buildRoute({ getDelivery });

        const response = await application.inject({
            method: "GET",
            url: "/api/v1/operator/deliveries/not-a-uuid"
        });

        expect(response.statusCode).toBe(400);
        expect(getDelivery).not.toHaveBeenCalled();
    });

    it("returns a redacted 503 when inspection fails", async () => {
        const listDeliveries = vi
            .fn<ListInboundDeliveriesUseCase>()
            .mockRejectedValue(new Error("private database detail"));
        const application = buildRoute({ listDeliveries });

        const response = await application.inject({
            method: "GET",
            url: "/api/v1/operator/deliveries"
        });

        expect(response.statusCode).toBe(503);
        expect(response.body).not.toContain("private database detail");
        expect(response.json()).toEqual({
            type: "urn:problem:gateway-unavailable",
            title: "Gateway unavailable",
            status: 503,
            detail: "The operator delivery request could not be completed"
        });
    });

    it("applies the configured operator guard to real routes", async () => {
        const application = buildRoute({ protected: true });

        const response = await application.inject({
            method: "GET",
            url: "/api/v1/operator/deliveries"
        });

        expect(response.statusCode).toBe(401);
    });

    it("replays a delivery with an explicit reason and idempotency key", async () => {
        const replayDelivery = vi
            .fn<ReplayInboundDeliveryUseCase>()
            .mockResolvedValue({ commandId: DELIVERY_ID, outcome: "REPLAYED" });
        const application = buildRoute({ authorization: platformAdminAuthorization(), replayDelivery });

        const response = await application.inject({
            method: "POST",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}/replay`,
            headers: operatorHeaders({ "idempotency-key": NEXT_DELIVERY_ID }),
            payload: { reason: "Retry after the upstream incident was resolved" }
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            commandId: DELIVERY_ID,
            idempotent: false,
            outcome: "REPLAYED"
        });
        expect(replayDelivery).toHaveBeenCalledWith({
            actorSubject: "platform-admin-42",
            deliveryId: DELIVERY_ID,
            idempotencyKey: NEXT_DELIVERY_ID,
            reason: "Retry after the upstream incident was resolved"
        });
    });

    it.each([
        { headers: operatorHeaders(), payload: { reason: "Retry after an incident" } },
        { headers: operatorHeaders({ "idempotency-key": NEXT_DELIVERY_ID }), payload: {} },
        {
            headers: operatorHeaders({ "idempotency-key": "not-a-uuid" }),
            payload: { reason: "Retry" }
        },
        {
            headers: operatorHeaders({ "idempotency-key": NEXT_DELIVERY_ID }),
            payload: { reason: " reason" }
        }
    ])("rejects invalid replay input before the use case", async ({ headers, payload }) => {
        const replayDelivery = vi.fn<ReplayInboundDeliveryUseCase>();
        const application = buildRoute({ authorization: platformAdminAuthorization(), replayDelivery });

        const response = await application.inject({
            method: "POST",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}/replay`,
            headers,
            payload
        });

        expect(response.statusCode).toBe(400);
        expect(replayDelivery).not.toHaveBeenCalled();
    });

    it("maps a replay rejection to a stable conflict problem", async () => {
        const replayDelivery = vi.fn<ReplayInboundDeliveryUseCase>().mockResolvedValue({
            commandId: DELIVERY_ID,
            outcome: "REJECTED",
            rejectionCode: "DELIVERY_PAYLOAD_EXPIRED"
        });
        const application = buildRoute({ authorization: platformAdminAuthorization(), replayDelivery });

        const response = await application.inject({
            method: "POST",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}/replay`,
            headers: operatorHeaders({ "idempotency-key": NEXT_DELIVERY_ID }),
            payload: { reason: "Retry after the upstream incident was resolved" }
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
            type: "urn:problem:delivery-payload-expired",
            title: "Delivery replay rejected",
            status: 409,
            detail: "The delivery cannot be replayed in its current state"
        });
    });

    it("returns an accepted in-progress replay response", async () => {
        const replayDelivery = vi.fn<ReplayInboundDeliveryUseCase>().mockResolvedValue({
            commandId: DELIVERY_ID,
            outcome: "IN_PROGRESS"
        });
        const application = buildRoute({ authorization: platformAdminAuthorization(), replayDelivery });

        const response = await application.inject({
            method: "POST",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}/replay`,
            headers: operatorHeaders({ "idempotency-key": NEXT_DELIVERY_ID }),
            payload: { reason: "Retry after the upstream incident was resolved" }
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            commandId: DELIVERY_ID,
            idempotent: false,
            outcome: "IN_PROGRESS"
        });
    });

    it("marks a repeated completed replay as idempotent", async () => {
        const replayDelivery = vi.fn<ReplayInboundDeliveryUseCase>().mockResolvedValue({
            commandId: DELIVERY_ID,
            idempotent: true,
            outcome: "REPLAYED"
        });
        const application = buildRoute({ authorization: platformAdminAuthorization(), replayDelivery });

        const response = await application.inject({
            method: "POST",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}/replay`,
            headers: operatorHeaders({ "idempotency-key": NEXT_DELIVERY_ID }),
            payload: { reason: "Retry after the upstream incident was resolved" }
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            commandId: DELIVERY_ID,
            idempotent: true,
            outcome: "REPLAYED"
        });
    });

    it("maps a reused idempotency key with different intent to a conflict", async () => {
        const replayDelivery = vi.fn<ReplayInboundDeliveryUseCase>().mockResolvedValue({
            commandId: DELIVERY_ID,
            outcome: "IDEMPOTENCY_CONFLICT"
        });
        const application = buildRoute({ authorization: platformAdminAuthorization(), replayDelivery });

        const response = await application.inject({
            method: "POST",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}/replay`,
            headers: operatorHeaders({ "idempotency-key": NEXT_DELIVERY_ID }),
            payload: { reason: "Retry after the upstream incident was resolved" }
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
            type: "urn:problem:operator-idempotency-conflict",
            title: "Operator command idempotency conflict",
            status: 409,
            detail: "The idempotency key was already used for a different command"
        });
    });
});

function buildRoute({
    authorization,
    getDelivery = vi.fn<GetInboundDeliveryUseCase>().mockResolvedValue(null),
    listDeliveries = vi
        .fn<ListInboundDeliveriesUseCase>()
        .mockResolvedValue({ items: [], nextCursor: null }),
    replayDelivery = vi
        .fn<ReplayInboundDeliveryUseCase>()
        .mockResolvedValue({ commandId: DELIVERY_ID, outcome: "REPLAYED" }),
    protected: authorizationEnabled = false
}: {
    authorization?: OperatorAuthorizationOptions;
    getDelivery?: GetInboundDeliveryUseCase;
    listDeliveries?: ListInboundDeliveriesUseCase;
    protected?: boolean;
    replayDelivery?: ReplayInboundDeliveryUseCase;
} = {}): FastifyInstance {
    const application = Fastify({
        ajv: { customOptions: { removeAdditional: false } },
        logger: false
    });
    applications.push(application);
    application.register(operatorDeliveryRoute, {
        authorization:
            authorization ??
            (authorizationEnabled
            ? {
                  enabled: true,
                  verifyToken: () => Promise.resolve({ authenticated: false })
              }
            : { enabled: false }),
        getDelivery,
        listDeliveries,
        replayDelivery
    });
    return application;
}

function platformAdminAuthorization(): OperatorAuthorizationOptions {
    return {
        enabled: true,
        verifyToken: () =>
            Promise.resolve({
                authenticated: true,
                principal: {
                    roles: new Set(["platform-admin"]),
                    subject: "platform-admin-42"
                }
            })
    };
}

function operatorHeaders(headers: Record<string, string> = {}): Record<string, string> {
    return { authorization: "Bearer aaa.bbb.ccc", ...headers };
}

function deliveryPage(): InboundDeliveryPage {
    return {
        items: [deliverySummary()],
        nextCursor: {
            deliveryId: NEXT_DELIVERY_ID,
            receivedAt: "2026-09-11T07:00:00.123456Z"
        }
    };
}

function deliverySummary(): InboundDeliverySummary {
    return {
        attemptCount: 5,
        completedAt: new Date("2026-09-11T08:05:00.000Z"),
        correlationId: null,
        deliveryId: DELIVERY_ID,
        errorCode: "DELIVERY_ATTEMPTS_EXHAUSTED",
        externalEventId: "event-901",
        lastCoreOrderId: null,
        lastHttpStatus: 503,
        provider: "MARKETPLACE_A",
        receivedAt: new Date("2026-09-11T08:00:00.000Z"),
        sourceSystem: "MARKETPLACE_A",
        status: "EXHAUSTED",
        updatedAt: new Date("2026-09-11T08:05:00.000Z")
    };
}

function deliveryDetail(): InboundDeliveryDetail {
    return {
        ...deliverySummary(),
        attempts: [
            {
                attemptId: "0199037b-6400-7000-8000-000000000911",
                attemptNumber: 1,
                completedAt: null,
                durationMilliseconds: null,
                errorCode: null,
                httpStatus: null,
                outcome: null,
                safeErrorMessage: null,
                startedAt: new Date("2026-09-11T08:01:00.000Z"),
                traceId: null
            }
        ],
        connectorId: "0199037b-6400-7000-8000-000000000001",
        connectorMode: "WEBHOOK",
        connectorStatus: "ACTIVE",
        mappingVersion: "marketplace-a-order-v1",
        nextAttemptAt: new Date("2026-09-11T08:05:00.000Z"),
        payloadExpiresAt: new Date("2026-10-11T08:00:00.000Z"),
        payloadRetained: true,
        safeErrorMessage: "Delivery attempts were exhausted"
    };
}
