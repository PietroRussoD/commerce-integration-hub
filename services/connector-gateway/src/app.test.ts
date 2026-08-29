import { afterEach, describe, expect, it } from "vitest";

import { buildApplication } from "./app.js";

const applications: ReturnType<typeof buildApplication>[] = [];

afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe("health endpoint", () => {
    it("reports that the gateway is running", async () => {
        const application = buildApplication();
        applications.push(application);

        const response = await application.inject({ method: "GET", url: "/health" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: "UP" });
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
});
