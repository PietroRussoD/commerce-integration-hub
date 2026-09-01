import { describe, expect, it } from "vitest";

import { readErpBClientConfiguration } from "./client-configuration.js";

describe("readErpBClientConfiguration", () => {
    it("loads a normalized origin and conservative defaults", () => {
        expect(
            readErpBClientConfiguration({
                ERP_B_API_TOKEN: "erp-b-local-token",
                ERP_B_BASE_URL: "https://erp-b.example.com/"
            })
        ).toEqual({
            apiToken: "erp-b-local-token",
            baseUrl: "https://erp-b.example.com",
            maxResponseBytes: 8_388_608,
            pageLimit: 100,
            retryAfterCapMilliseconds: 900_000,
            timeoutMilliseconds: 5_000
        });
    });

    it("loads explicit operational bounds", () => {
        expect(
            readErpBClientConfiguration({
                ERP_B_API_TOKEN: "erp-b-local-token",
                ERP_B_BASE_URL: "http://erp-b:8080",
                ERP_B_MAX_RESPONSE_BYTES: "1048576",
                ERP_B_PAGE_LIMIT: "50",
                ERP_B_RETRY_AFTER_CAP_MILLISECONDS: "60000",
                ERP_B_TIMEOUT_MILLISECONDS: "10000"
            })
        ).toEqual({
            apiToken: "erp-b-local-token",
            baseUrl: "http://erp-b:8080",
            maxResponseBytes: 1_048_576,
            pageLimit: 50,
            retryAfterCapMilliseconds: 60_000,
            timeoutMilliseconds: 10_000
        });
    });

    it.each([undefined, "", "relative/path"])("rejects invalid base URL %s", (baseUrl) => {
        expect(() =>
            readErpBClientConfiguration({
                ERP_B_API_TOKEN: "erp-b-local-token",
                ERP_B_BASE_URL: baseUrl
            })
        ).toThrow(/ERP_B_BASE_URL (?:is required|must be)/);
    });

    it.each([
        "ftp://erp-b.example.com",
        "https://user:password@erp-b.example.com",
        "https://erp-b.example.com/api",
        "https://erp-b.example.com?target=other",
        "https://erp-b.example.com#fragment"
    ])("rejects unsafe base URL %s", (baseUrl) => {
        expect(() =>
            readErpBClientConfiguration({
                ERP_B_API_TOKEN: "erp-b-local-token",
                ERP_B_BASE_URL: baseUrl
            })
        ).toThrow(
            "ERP_B_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment"
        );
    });

    it.each([undefined, "", " token", "token ", "line\nbreak", "token@host", "é", "x".repeat(2_049)])(
        "rejects invalid API token",
        (apiToken) => {
            expect(() =>
                readErpBClientConfiguration({
                    ERP_B_API_TOKEN: apiToken,
                    ERP_B_BASE_URL: "https://erp-b.example.com"
                })
            ).toThrow(
                "ERP_B_API_TOKEN must be a canonical bearer token of at most 2048 characters"
            );
        }
    );

    it.each([
        ["ERP_B_MAX_RESPONSE_BYTES", "1023", "1024", "33554432"],
        ["ERP_B_MAX_RESPONSE_BYTES", "33554433", "1024", "33554432"],
        ["ERP_B_PAGE_LIMIT", "0", "1", "100"],
        ["ERP_B_PAGE_LIMIT", "101", "1", "100"],
        ["ERP_B_TIMEOUT_MILLISECONDS", "99", "100", "30000"],
        ["ERP_B_TIMEOUT_MILLISECONDS", "30001", "100", "30000"],
        ["ERP_B_RETRY_AFTER_CAP_MILLISECONDS", "3600001", "0", "3600000"],
        ["ERP_B_RETRY_AFTER_CAP_MILLISECONDS", "-1", "0", "3600000"],
        ["ERP_B_PAGE_LIMIT", "1.5", "1", "100"]
    ])("rejects invalid %s value %s", (name, value, minimum, maximum) => {
        expect(() =>
            readErpBClientConfiguration({
                ERP_B_API_TOKEN: "erp-b-local-token",
                ERP_B_BASE_URL: "https://erp-b.example.com",
                [name]: value
            })
        ).toThrow(`${name} must be an integer between ${minimum} and ${maximum}`);
    });
});
