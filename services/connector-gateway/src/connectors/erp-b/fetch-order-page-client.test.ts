import { ReadableStream } from "node:stream/web";

import { describe, expect, it, vi } from "vitest";

import type { ErpBClientConfiguration } from "./client-configuration.js";
import { FetchErpBOrderPageClient } from "./fetch-order-page-client.js";

const VALID_PAGE = {
    items: [
        {
            changeId: "chg-00042",
            orderCode: "ERP-00042",
            currencyCode: "EUR",
            declaredTotal: "39.98",
            positions: [
                {
                    positionId: "1",
                    articleNumber: "SKU-BOOK-1",
                    units: "2",
                    pricePerUnit: "19.99"
                }
            ]
        }
    ],
    nextCursor: "opaque-cursor-43",
    hasMore: true
};

describe("FetchErpBOrderPageClient", () => {
    it("fetches and parses the initial provider page", async () => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse(VALID_PAGE));
        const client = createClient(fetchImplementation);

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            outcome: "PAGE_RECEIVED",
            page: VALID_PAGE
        });
        expect(fetchImplementation).toHaveBeenCalledWith(
            new URL("https://erp-b.example.com/erp-b/v1/orders?limit=100"),
            expect.objectContaining({
                headers: {
                    Accept: "application/json",
                    Authorization: "Bearer erp-b-local-token"
                },
                method: "GET",
                redirect: "manual"
            })
        );
    });

    it("encodes an opaque cursor and configured page limit", async () => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse({ ...VALID_PAGE, hasMore: false }));
        const client = createClient(fetchImplementation, { pageLimit: 25 });

        await client.fetchPage({ cursor: "opaque/cursor?42&tenant=a" });

        expect(fetchImplementation).toHaveBeenCalledWith(
            new URL(
                "https://erp-b.example.com/erp-b/v1/orders?limit=25&cursor=opaque%2Fcursor%3F42%26tenant%3Da"
            ),
            expect.any(Object)
        );
    });

    it.each([401, 403] as const)("classifies HTTP %s as blocked configuration", async (status) => {
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }))
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_AUTHENTICATION_REJECTED",
            httpStatus: status,
            outcome: "BLOCKED_CONFIGURATION"
        });
    });

    it.each([408, 425, 429, 500, 503, 599])("classifies HTTP %s as retryable", async (status) => {
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }))
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_RETRYABLE_STATUS",
            httpStatus: status,
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("returns a bounded Retry-After delay", async () => {
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(
                new Response(null, { status: 429, headers: { "Retry-After": "1200" } })
            )
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_RETRYABLE_STATUS",
            httpStatus: 429,
            outcome: "RETRYABLE_FAILURE",
            retryAfterMilliseconds: 900_000
        });
    });

    it.each([204, 302, 400, 404])("classifies HTTP %s as a protocol failure", async (status) => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status }));
        const client = createClient(fetchImplementation);

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_UNEXPECTED_STATUS",
            httpStatus: status,
            outcome: "PROTOCOL_FAILURE"
        });
        expect(fetchImplementation).toHaveBeenCalledWith(
            expect.any(URL),
            expect.objectContaining({ redirect: "manual" })
        );
    });

    it.each([
        new Response(JSON.stringify(VALID_PAGE), {
            status: 200,
            headers: { "Content-Type": "text/plain" }
        }),
        new Response(JSON.stringify(VALID_PAGE), { status: 200 })
    ])("rejects an invalid success content type", async (response) => {
        const client = createClient(vi.fn<typeof fetch>().mockResolvedValue(response));

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_INVALID_CONTENT_TYPE",
            httpStatus: 200,
            outcome: "PROTOCOL_FAILURE"
        });
    });

    it.each([
        "{",
        JSON.stringify({ ...VALID_PAGE, unexpected: true }),
        ""
    ])("rejects an invalid JSON page", async (body) => {
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(
                new Response(body, {
                    status: 200,
                    headers: { "Content-Type": "APPLICATION/JSON; charset=utf-8" }
                })
            )
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_INVALID_RESPONSE",
            httpStatus: 200,
            outcome: "PROTOCOL_FAILURE"
        });
    });

    it("rejects an absent success body", async () => {
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(
                new Response(null, {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            )
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_INVALID_RESPONSE",
            httpStatus: 200,
            outcome: "PROTOCOL_FAILURE"
        });
    });

    it("stops reading a response above the configured byte limit", async () => {
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(
                new Response(JSON.stringify({ padding: "x".repeat(2_000) }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            ),
            { maxResponseBytes: 1_024 }
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_RESPONSE_TOO_LARGE",
            httpStatus: 200,
            outcome: "PROTOCOL_FAILURE"
        });
    });

    it("keeps the size classification when stream cancellation fails", async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(2_000));
            },
            cancel() {
                return Promise.reject(new Error("provider reset during cancellation"));
            }
        });
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(
                new Response(body, {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            ),
            { maxResponseBytes: 1_024 }
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_RESPONSE_TOO_LARGE",
            httpStatus: 200,
            outcome: "PROTOCOL_FAILURE"
        });
    });

    it("classifies a response-stream failure as a network error", async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.error(new Error("provider stream reset"));
            }
        });
        const client = createClient(
            vi.fn<typeof fetch>().mockResolvedValue(
                new Response(body, {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            )
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_NETWORK_ERROR",
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("classifies a network failure without exposing its error", async () => {
        const client = createClient(
            vi.fn<typeof fetch>().mockRejectedValue(new Error("getaddrinfo secret-provider"))
        );

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_NETWORK_ERROR",
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("classifies its request timeout", async () => {
        const client = createClient(abortableFetch(), { timeoutMilliseconds: 1 });

        await expect(client.fetchPage({ cursor: null })).resolves.toEqual({
            errorCode: "ERP_B_TIMEOUT",
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("classifies caller cancellation separately from timeout", async () => {
        const controller = new AbortController();
        controller.abort();
        const client = createClient(abortableFetch());

        await expect(
            client.fetchPage({ cursor: null, signal: controller.signal })
        ).resolves.toEqual({
            errorCode: "ERP_B_REQUEST_ABORTED",
            outcome: "RETRYABLE_FAILURE"
        });
    });
});

function createClient(
    fetchImplementation: typeof fetch,
    overrides: Partial<ErpBClientConfiguration> = {}
): FetchErpBOrderPageClient {
    return new FetchErpBOrderPageClient({
        configuration: {
            apiToken: "erp-b-local-token",
            baseUrl: "https://erp-b.example.com",
            maxResponseBytes: 8_388_608,
            pageLimit: 100,
            retryAfterCapMilliseconds: 900_000,
            timeoutMilliseconds: 5_000,
            ...overrides
        },
        currentTimeMilliseconds: () => Date.parse("2026-09-01T09:00:00.000Z"),
        fetchImplementation
    });
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
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
