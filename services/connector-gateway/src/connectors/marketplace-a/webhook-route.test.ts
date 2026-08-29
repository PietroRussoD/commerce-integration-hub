import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReceiveInboundDeliveryUseCase } from "../../application/deliveries/receive-inbound-delivery.js";
import type {
    MarketplaceAWebhookAuthenticationInput,
    MarketplaceAWebhookAuthenticationResult
} from "./webhook-authenticator.js";
import {
    MARKETPLACE_A_WEBHOOK_PATH,
    type MarketplaceAWebhookRouteOptions,
    marketplaceAWebhookRoute
} from "./webhook-route.js";

const VALID_PAYLOAD = {
    eventId: "evt-42",
    eventType: "order.created",
    order: {
        orderNumber: "MA-42",
        currency: "EUR",
        totalCents: 3998,
        lines: [
            {
                lineNumber: "1",
                productCode: "SKU-BOOK-1",
                quantity: 2,
                unitPriceCents: 1999
            }
        ]
    }
};
const RAW_BODY = `${JSON.stringify(VALID_PAYLOAD)}\n`;
const applications: FastifyInstance[] = [];

afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe("MARKETPLACE_A webhook route", () => {
    it("passes the exact raw body and authentication headers to the authenticator", async () => {
        const authenticate = vi
            .fn<
                (
                    input: MarketplaceAWebhookAuthenticationInput
                ) => MarketplaceAWebhookAuthenticationResult
            >()
            .mockReturnValue({ authenticated: true });
        const application = buildTestApplication(authenticate);

        const response = await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: {
                "content-type": "application/json",
                "x-webhook-key-id": "current-key",
                "x-webhook-signature": `v1=${"00".repeat(32)}`,
                "x-webhook-timestamp": "1784073600"
            },
            payload: RAW_BODY
        });

        expect(authenticate).toHaveBeenCalledWith({
            keyId: "current-key",
            rawBody: Buffer.from(RAW_BODY),
            signatureHeader: `v1=${"00".repeat(32)}`,
            timestamp: "1784073600"
        });
        expect(response.statusCode).toBe(202);
    });

    it("passes missing authentication headers as absent values", async () => {
        const authenticate = vi
            .fn<
                (
                    input: MarketplaceAWebhookAuthenticationInput
                ) => MarketplaceAWebhookAuthenticationResult
            >()
            .mockReturnValue({ authenticated: false, reason: "invalid_timestamp" });
        const application = buildTestApplication(authenticate);

        await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload: RAW_BODY
        });

        expect(authenticate).toHaveBeenCalledWith({
            keyId: undefined,
            rawBody: Buffer.from(RAW_BODY),
            signatureHeader: undefined,
            timestamp: undefined
        });
    });

    it.each(["invalid_timestamp", "unknown_key", "invalid_signature"] as const)(
        "returns the same generic response for %s",
        async (reason) => {
            const application = buildTestApplication(() => ({
                authenticated: false,
                reason
            }));

            const response = await application.inject({
                method: "POST",
                url: MARKETPLACE_A_WEBHOOK_PATH,
                headers: { "content-type": "application/json" },
                payload: RAW_BODY
            });

            expect(response.statusCode).toBe(401);
            expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
            expect(response.json()).toEqual({
                type: "urn:problem:webhook-authentication",
                title: "Webhook authentication failed",
                status: 401,
                detail: "The webhook credentials could not be verified"
            });
            expect(response.body).not.toContain(reason);
        }
    );

    it("authenticates before parsing an untrusted payload", async () => {
        const application = buildTestApplication(() => ({
            authenticated: false,
            reason: "invalid_signature"
        }));

        const response = await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload: '{"eventId":'
        });

        expect(response.statusCode).toBe(401);
    });

    it.each([
        '{"eventId":',
        JSON.stringify({ ...VALID_PAYLOAD, unexpected: true })
    ])("returns the same generic response for an invalid provider payload", async (payload) => {
        const application = buildTestApplication(() => ({ authenticated: true }));

        const response = await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload
        });

        expect(response.statusCode).toBe(400);
        expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
        expect(response.json()).toEqual({
            type: "urn:problem:invalid-provider-payload",
            title: "Invalid provider payload",
            status: 400,
            detail: "The webhook payload does not match the MARKETPLACE_A contract"
        });
    });

    it.each([
        {
            reason: "unsupported_event_type",
            payload: { ...VALID_PAYLOAD, eventType: "order.cancelled" }
        },
        {
            reason: "unsupported_currency",
            payload: {
                ...VALID_PAYLOAD,
                order: { ...VALID_PAYLOAD.order, currency: "JPY" }
            }
        },
        {
            reason: "duplicate_line_number",
            payload: {
                ...VALID_PAYLOAD,
                order: {
                    ...VALID_PAYLOAD.order,
                    totalCents: 5997,
                    lines: [
                        ...VALID_PAYLOAD.order.lines,
                        {
                            lineNumber: "1",
                            productCode: "SKU-BOOK-2",
                            quantity: 1,
                            unitPriceCents: 1999
                        }
                    ]
                }
            }
        },
        {
            reason: "total_mismatch",
            payload: {
                ...VALID_PAYLOAD,
                order: { ...VALID_PAYLOAD.order, totalCents: 3999 }
            }
        }
    ])("returns the same generic response for $reason", async ({ reason, payload }) => {
        const application = buildTestApplication(() => ({ authenticated: true }));

        const response = await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload
        });

        expect(response.statusCode).toBe(422);
        expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
        expect(response.json()).toEqual({
            type: "urn:problem:unsupported-provider-content",
            title: "Unsupported provider content",
            status: 422,
            detail: "The webhook payload cannot be mapped to a canonical order"
        });
        expect(response.body).not.toContain(reason);
    });

    it("returns accepted only after durable first receipt", async () => {
        const receiveInboundDelivery = vi
            .fn<ReceiveInboundDeliveryUseCase>()
            .mockResolvedValue({ deliveryId: "0199037b-6400-7000-8000-000000000301", outcome: "CREATED" });
        const application = buildTestApplication(
            () => ({ authenticated: true }),
            receiveInboundDelivery
        );

        const response = await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload: RAW_BODY
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            deliveryId: "0199037b-6400-7000-8000-000000000301",
            status: "ACCEPTED"
        });
        expect(receiveInboundDelivery).toHaveBeenCalledOnce();
    });

    it("marks an equivalent replay without creating another delivery", async () => {
        const application = buildTestApplication(
            () => ({ authenticated: true }),
            () =>
                Promise.resolve({
                    deliveryId: "0199037b-6400-7000-8000-000000000301",
                    outcome: "EQUIVALENT_REPLAY"
                })
        );

        const response = await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload: RAW_BODY
        });

        expect(response.statusCode).toBe(202);
        expect(response.headers["idempotent-replay"]).toBe("true");
    });

    it("returns conflict without exposing stored delivery content", async () => {
        const application = buildTestApplication(
            () => ({ authenticated: true }),
            () =>
                Promise.resolve({
                    deliveryId: "0199037b-6400-7000-8000-000000000301",
                    outcome: "PAYLOAD_CONFLICT"
                })
        );

        const response = await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload: RAW_BODY
        });

        expect(response.statusCode).toBe(409);
        expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
        expect(response.json()).toEqual({
            type: "urn:problem:provider-event-conflict",
            title: "Provider event conflict",
            status: 409,
            detail: "The provider event identity was already used for different content"
        });
    });

    it("fails closed when durable receipt fails", async () => {
        const application = buildTestApplication(
            () => ({ authenticated: true }),
            () => Promise.reject(new Error("database unavailable"))
        );

        const response = await application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload: RAW_BODY
        });

        expect(response.statusCode).toBe(503);
        expect(response.headers["content-type"]).toMatch(/^application\/problem\+json/);
        expect(response.json()).toEqual({
            type: "urn:problem:gateway-unavailable",
            title: "Gateway unavailable",
            status: 503,
            detail: "The webhook delivery could not be persisted"
        });
    });
});

function buildTestApplication(
    authenticate: MarketplaceAWebhookRouteOptions["authenticate"],
    receiveInboundDelivery: ReceiveInboundDeliveryUseCase = () =>
        Promise.resolve({
            deliveryId: "0199037b-6400-7000-8000-000000000300",
            outcome: "CREATED"
        })
): FastifyInstance {
    const application = Fastify();
    applications.push(application);
    application.register(marketplaceAWebhookRoute, { authenticate, receiveInboundDelivery });
    return application;
}
