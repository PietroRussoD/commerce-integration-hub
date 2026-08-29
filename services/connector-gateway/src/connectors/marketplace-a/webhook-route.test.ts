import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    MarketplaceAWebhookAuthenticationInput,
    MarketplaceAWebhookAuthenticationResult
} from "./webhook-authenticator.js";
import {
    MARKETPLACE_A_WEBHOOK_PATH,
    type MarketplaceAWebhookRouteOptions,
    marketplaceAWebhookRoute
} from "./webhook-route.js";

const RAW_BODY = '{  "eventId" : "evt-42" }\n';
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
        expect(response.statusCode).toBe(503);
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

    it("fails closed after successful authentication until durable receipt exists", async () => {
        const application = buildTestApplication(() => ({ authenticated: true }));

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
            detail: "Durable webhook receipt is not available"
        });
    });
});

function buildTestApplication(
    authenticate: MarketplaceAWebhookRouteOptions["authenticate"]
): FastifyInstance {
    const application = Fastify();
    applications.push(application);
    application.register(marketplaceAWebhookRoute, { authenticate });
    return application;
}
