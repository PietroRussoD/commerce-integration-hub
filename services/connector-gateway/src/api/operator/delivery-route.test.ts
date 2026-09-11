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
import { decodeDeliveryCursor, encodeDeliveryCursor } from "./delivery-cursor.js";
import { operatorDeliveryRoute } from "./delivery-route.js";

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
});

function buildRoute({
    getDelivery = vi.fn<GetInboundDeliveryUseCase>().mockResolvedValue(null),
    listDeliveries = vi
        .fn<ListInboundDeliveriesUseCase>()
        .mockResolvedValue({ items: [], nextCursor: null }),
    protected: authorizationEnabled = false
}: {
    getDelivery?: GetInboundDeliveryUseCase;
    listDeliveries?: ListInboundDeliveriesUseCase;
    protected?: boolean;
} = {}): FastifyInstance {
    const application = Fastify({
        ajv: { customOptions: { removeAdditional: false } },
        logger: false
    });
    applications.push(application);
    application.register(operatorDeliveryRoute, {
        authorization: authorizationEnabled
            ? {
                  enabled: true,
                  verifyToken: () => Promise.resolve({ authenticated: false })
              }
            : { enabled: false },
        getDelivery,
        listDeliveries
    });
    return application;
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
