import { describe, expect, it, vi } from "vitest";

import type { CanonicalOrder } from "../../application/orders/canonical-order.js";
import {
    FetchIntegrationCoreOrderClient
} from "./fetch-integration-core-order-client.js";
import type { IntegrationCoreClientConfiguration } from "./integration-core-client-configuration.js";
import { parseRetryAfter } from "./retry-after.js";

const CORE_ORDER_ID = "0199037b-6400-7000-8000-000000000601";
const SOURCE_API_KEY = "src_marketplace_a.local-secret";
const canonicalOrder: CanonicalOrder = {
    externalId: "MA-6001",
    currency: "EUR",
    declaredTotalAmount: "39.98",
    items: [
        {
            externalLineId: "line-1",
            sku: "SKU-BOOK-1",
            quantity: "2",
            unitPrice: "19.99"
        }
    ]
};

describe("FetchIntegrationCoreOrderClient", () => {
    it.each([
        [201, false],
        [200, true]
    ] as const)("classifies HTTP %s as delivered", async (status, equivalentReplay) => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse(status, { id: CORE_ORDER_ID }));
        const client = createClient(fetchImplementation);

        const result = await client.forward({
            canonicalOrder,
            correlationId: "0199037b-6400-7000-8000-000000000602"
        });

        expect(result).toEqual({
            coreOrderId: CORE_ORDER_ID,
            equivalentReplay,
            httpStatus: status,
            outcome: "DELIVERED"
        });
        expect(fetchImplementation).toHaveBeenCalledWith(
            "https://core.example.com/api/v1/orders",
            expect.objectContaining({
                body: JSON.stringify(canonicalOrder),
                headers: {
                    "Content-Type": "application/json",
                    "X-Correlation-ID": "0199037b-6400-7000-8000-000000000602",
                    "X-Source-API-Key": SOURCE_API_KEY
                },
                method: "POST",
                redirect: "manual"
            })
        );
    });

    it("omits an absent correlation ID", async () => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse(201, { id: CORE_ORDER_ID }));
        const client = createClient(fetchImplementation);

        await client.forward({ canonicalOrder });

        expect(fetchImplementation).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: {
                    "Content-Type": "application/json",
                    "X-Source-API-Key": SOURCE_API_KEY
                }
            })
        );
    });

    it.each([401, 403] as const)("classifies HTTP %s as blocked configuration", async (status) => {
        const client = createClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })));

        await expect(client.forward({ canonicalOrder })).resolves.toEqual({
            errorCode: "CORE_AUTHENTICATION_REJECTED",
            httpStatus: status,
            outcome: "BLOCKED_CONFIGURATION"
        });
    });

    it.each([400, 404, 409, 422] as const)("classifies HTTP %s as permanent", async (status) => {
        const client = createClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })));

        await expect(client.forward({ canonicalOrder })).resolves.toEqual({
            errorCode: "CORE_REQUEST_REJECTED",
            httpStatus: status,
            outcome: "PERMANENT_FAILURE"
        });
    });

    it.each([408, 425, 429, 500, 503, 599])("classifies HTTP %s as retryable", async (status) => {
        const client = createClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })));

        await expect(client.forward({ canonicalOrder })).resolves.toEqual({
            errorCode: "CORE_RETRYABLE_STATUS",
            httpStatus: status,
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("returns a bounded Retry-After delay", async () => {
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(
                new Response(null, {
                    status: 429,
                    headers: { "Retry-After": "1200" }
                })
            )
        );

        await expect(client.forward({ canonicalOrder })).resolves.toEqual({
            errorCode: "CORE_RETRYABLE_STATUS",
            httpStatus: 429,
            outcome: "RETRYABLE_FAILURE",
            retryAfterMilliseconds: 900_000
        });
    });

    it("classifies unrecognized status without following redirects", async () => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 302 }));
        const client = createClient(fetchImplementation);

        await expect(client.forward({ canonicalOrder })).resolves.toEqual({
            errorCode: "CORE_UNEXPECTED_STATUS",
            httpStatus: 302,
            outcome: "RETRYABLE_FAILURE"
        });
        expect(fetchImplementation).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ redirect: "manual" })
        );
    });

    it.each([
        new Response("not-json", {
            status: 201,
            headers: { "Content-Type": "text/plain" }
        }),
        new Response("{", {
            status: 201,
            headers: { "Content-Type": "application/json" }
        }),
        jsonResponse(201, { id: "not-a-uuid" }),
        jsonResponse(201, [CORE_ORDER_ID]),
        jsonResponse(201, { status: "RECEIVED" }),
        new Response(JSON.stringify({ id: CORE_ORDER_ID, padding: "x".repeat(65_536) }), {
            status: 201,
            headers: { "Content-Type": "application/json" }
        })
    ])("classifies an invalid successful response as retryable", async (response) => {
        const client = createClient(vi.fn<typeof fetch>().mockResolvedValue(response));

        await expect(client.forward({ canonicalOrder })).resolves.toEqual({
            errorCode: "CORE_INVALID_RESPONSE",
            httpStatus: 201,
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("classifies a network failure without exposing its error", async () => {
        const client = createClient(
            vi.fn<typeof fetch>().mockRejectedValue(new Error("getaddrinfo ENOTFOUND secret-host"))
        );

        await expect(client.forward({ canonicalOrder })).resolves.toEqual({
            errorCode: "CORE_NETWORK_ERROR",
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("classifies its request timeout", async () => {
        const client = createClient(abortableFetch(), { timeoutMilliseconds: 1 });

        await expect(client.forward({ canonicalOrder })).resolves.toEqual({
            errorCode: "CORE_TIMEOUT",
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("classifies caller cancellation separately from timeout", async () => {
        const controller = new AbortController();
        controller.abort();
        const client = createClient(abortableFetch());

        await expect(
            client.forward({ canonicalOrder, signal: controller.signal })
        ).resolves.toEqual({
            errorCode: "CORE_REQUEST_ABORTED",
            outcome: "RETRYABLE_FAILURE"
        });
    });
});

describe("parseRetryAfter", () => {
    const now = Date.parse("2026-08-29T18:00:00.000Z");

    it.each([
        [null, undefined],
        ["invalid", undefined],
        ["999999999999999999999999", undefined],
        ["0", 0],
        [" 30 ", 30_000],
        ["1200", 900_000],
        ["Sat, 29 Aug 2026 18:02:00 GMT", 120_000],
        ["Sat, 29 Aug 2026 17:59:00 GMT", 0],
        ["Sat, 29 Aug 2026 19:00:00 GMT", 900_000]
    ] as const)("parses bounded Retry-After value %s", (value, expected) => {
        expect(parseRetryAfter(value, now, 900_000)).toBe(expected);
    });
});

function createClient(
    fetchImplementation: typeof fetch,
    overrides: Partial<IntegrationCoreClientConfiguration> = {}
): FetchIntegrationCoreOrderClient {
    return new FetchIntegrationCoreOrderClient({
        configuration: {
            baseUrl: "https://core.example.com",
            retryAfterCapMilliseconds: 900_000,
            sourceApiKey: SOURCE_API_KEY,
            timeoutMilliseconds: 5_000,
            ...overrides
        },
        currentTimeMilliseconds: () => Date.parse("2026-08-29T18:00:00.000Z"),
        fetchImplementation
    });
}

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
    });
}

function abortableFetch(): typeof fetch {
    return (_input, init) =>
        new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!(signal instanceof AbortSignal)) {
                reject(new Error("missing abort signal"));
                return;
            }
            if (signal.aborted) {
                reject(new Error("request aborted"));
                return;
            }
            signal.addEventListener("abort", () => reject(new Error("request aborted")), {
                once: true
            });
        });
}
