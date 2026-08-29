import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
    MARKETPLACE_A_WEBHOOK_BODY_LIMIT_BYTES,
    configureMarketplaceARawJsonBodyParser
} from "./raw-json-body-parser.js";

interface RawBodyResponse {
    byteLength: number;
    hex: string;
}

interface RegularBody {
    value: string;
}

const applications: FastifyInstance[] = [];

afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe("MARKETPLACE_A raw JSON body parser", () => {
    it("preserves the exact request bytes", async () => {
        const application = buildTestApplication();
        const rawBody = '{  "eventId" : "evt-42" }\n';

        const response = await application.inject({
            method: "POST",
            url: "/marketplace-a-webhook",
            headers: { "content-type": "application/json; charset=utf-8" },
            payload: rawBody
        });

        expect(response.statusCode).toBe(200);
        expect(response.json<RawBodyResponse>()).toEqual({
            byteLength: Buffer.byteLength(rawBody),
            hex: Buffer.from(rawBody).toString("hex")
        });
    });

    it("accepts a body at the configured byte limit", async () => {
        const application = buildTestApplication();

        const response = await application.inject({
            method: "POST",
            url: "/marketplace-a-webhook",
            headers: { "content-type": "application/json" },
            payload: "a".repeat(MARKETPLACE_A_WEBHOOK_BODY_LIMIT_BYTES)
        });

        expect(response.statusCode).toBe(200);
        expect(response.json<RawBodyResponse>().byteLength).toBe(
            MARKETPLACE_A_WEBHOOK_BODY_LIMIT_BYTES
        );
    });

    it("rejects a body above the configured byte limit", async () => {
        const application = buildTestApplication();

        const response = await application.inject({
            method: "POST",
            url: "/marketplace-a-webhook",
            headers: { "content-type": "application/json" },
            payload: "a".repeat(MARKETPLACE_A_WEBHOOK_BODY_LIMIT_BYTES + 1)
        });

        expect(response.statusCode).toBe(413);
    });

    it("rejects an unsupported media type", async () => {
        const application = buildTestApplication();

        const response = await application.inject({
            method: "POST",
            url: "/marketplace-a-webhook",
            headers: { "content-type": "text/plain" },
            payload: "not-json"
        });

        expect(response.statusCode).toBe(415);
    });

    it("does not change JSON parsing outside the connector scope", async () => {
        const application = buildTestApplication();

        const response = await application.inject({
            method: "POST",
            url: "/regular-json",
            payload: { value: "parsed" }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ value: "parsed" });
    });
});

function buildTestApplication(): FastifyInstance {
    const application = Fastify();
    applications.push(application);

    application.register((scope) => {
        configureMarketplaceARawJsonBodyParser(scope);
        scope.post<{ Body: Buffer; Reply: RawBodyResponse }>(
            "/marketplace-a-webhook",
            (request) => ({
                byteLength: request.body.byteLength,
                hex: request.body.toString("hex")
            })
        );
    });
    application.post<{ Body: RegularBody }>("/regular-json", (request) => request.body);

    return application;
}
