import { afterEach, describe, expect, it } from "vitest";

import { buildApplication } from "./app.js";

const applications: ReturnType<typeof buildApplication>[] = [];

interface OpenApiDocumentSummary {
    components?: {
        securitySchemes?: Record<string, unknown>;
    };
    info: { title: string; version: string };
    paths: Record<
        string,
        {
            get?: { security?: readonly Record<string, unknown>[] };
            post?: { security?: readonly Record<string, unknown>[] };
        }
    >;
}

afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe("health endpoint", () => {
    it("exposes an OpenAPI document generated from the registered routes", async () => {
        const application = buildApplication();
        applications.push(application);

        await application.ready();
        const response = await application.inject({ method: "GET", url: "/openapi.json" });
        const document: OpenApiDocumentSummary = response.json();

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("application/json");
        expect(document.info).toEqual({
            title: "Commerce Integration Hub Connector Gateway API",
            version: "1.0.0-SNAPSHOT",
            description: "Provider-facing connector and operational health API."
        });
        expect(document.paths).toHaveProperty("/health");
        expect(document.paths).toHaveProperty("/health/live");
    });

    it("reports that the gateway is running", async () => {
        const application = buildApplication();
        applications.push(application);

        for (const url of ["/health", "/health/live"]) {
            const response = await application.inject({ method: "GET", url });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ status: "UP" });
        }
    });

    it("documents the protected operator delivery boundary", async () => {
        const application = buildApplication({
            operatorDeliveries: {
                authorization: {
                    enabled: true,
                    verifyToken: () => Promise.resolve({ authenticated: false })
                },
                getDelivery: () => Promise.resolve(null),
                listDeliveries: () => Promise.resolve({ items: [], nextCursor: null }),
                replayDelivery: () =>
                    Promise.resolve({ commandId: "unused", outcome: "REPLAYED" as const })
            }
        });
        applications.push(application);

        await application.ready();
        const response = await application.inject({ method: "GET", url: "/openapi.json" });
        const document: OpenApiDocumentSummary = response.json();

        expect(document.components?.securitySchemes).toMatchObject({
            operatorJwt: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT"
            }
        });
        for (const path of [
            "/api/v1/operator/deliveries",
            "/api/v1/operator/deliveries/{deliveryId}",
            "/api/v1/operator/deliveries/{deliveryId}/replay"
        ]) {
            const operation = document.paths[path]?.get ?? document.paths[path]?.post;
            expect(operation?.security).toEqual([{ operatorJwt: [] }]);
        }
    });

    it("registers the configured provider boundary", async () => {
        const application = buildApplication({
            marketplaceAWebhook: {
                authenticate: () => ({ authenticated: false, reason: "unknown_key" }),
                receiveInboundDelivery: () =>
                    Promise.resolve({ deliveryId: "unused", outcome: "CREATED" })
            }
        });
        applications.push(application);

        const response = await application.inject({
            method: "POST",
            url: "/providers/marketplace-a/v1/order-webhooks",
            headers: { "content-type": "application/json" },
            payload: "{}"
        });

        expect(response.statusCode).toBe(401);
    });

    it("exposes a configured Prometheus registry", async () => {
        const application = buildApplication({
            metrics: {
                contentType: "text/plain; version=0.0.4; charset=utf-8",
                metrics: () => Promise.resolve("gateway_test_metric 1\n")
            }
        });
        applications.push(application);

        const response = await application.inject({ method: "GET", url: "/metrics" });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toBe(
            "text/plain; version=0.0.4; charset=utf-8"
        );
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.body).toBe("gateway_test_metric 1\n");
    });

    it.each([
        [true, 200, "UP"],
        [false, 503, "DOWN"]
    ] as const)("reports database readiness %s", async (ready, statusCode, status) => {
        const application = buildApplication({
            readiness: () => Promise.resolve(ready)
        });
        applications.push(application);

        const response = await application.inject({ method: "GET", url: "/health/ready" });

        expect(response.statusCode).toBe(statusCode);
        expect(response.json()).toEqual({
            checks: { database: status },
            status
        });
    });
});
