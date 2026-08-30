import { describe, expect, it } from "vitest";

import { readIntegrationCoreClientConfiguration } from "./integration-core-client-configuration.js";

const SOURCE_API_KEY = "src_marketplace_a.local-secret";

describe("readIntegrationCoreClientConfiguration", () => {
    it("loads a normalized origin and conservative defaults", () => {
        expect(
            readIntegrationCoreClientConfiguration({
                INTEGRATION_CORE_BASE_URL: "https://core.example.com/",
                INTEGRATION_CORE_SOURCE_API_KEY: SOURCE_API_KEY
            })
        ).toEqual({
            baseUrl: "https://core.example.com",
            retryAfterCapMilliseconds: 900_000,
            sourceApiKey: SOURCE_API_KEY,
            timeoutMilliseconds: 5_000
        });
    });

    it("loads explicit timeout and retry-after bounds", () => {
        expect(
            readIntegrationCoreClientConfiguration({
                INTEGRATION_CORE_BASE_URL: "http://integration-core:8080",
                INTEGRATION_CORE_RETRY_AFTER_CAP_MILLISECONDS: "60000",
                INTEGRATION_CORE_SOURCE_API_KEY: SOURCE_API_KEY,
                INTEGRATION_CORE_TIMEOUT_MILLISECONDS: "10000"
            })
        ).toEqual({
            baseUrl: "http://integration-core:8080",
            retryAfterCapMilliseconds: 60_000,
            sourceApiKey: SOURCE_API_KEY,
            timeoutMilliseconds: 10_000
        });
    });

    it.each([undefined, "", "relative/path"])("rejects invalid base URL %s", (baseUrl) => {
        expect(() =>
            readIntegrationCoreClientConfiguration({
                INTEGRATION_CORE_BASE_URL: baseUrl,
                INTEGRATION_CORE_SOURCE_API_KEY: SOURCE_API_KEY
            })
        ).toThrow(/INTEGRATION_CORE_BASE_URL (?:is required|must be)/);
    });

    it.each([
        "ftp://core.example.com",
        "https://user:password@core.example.com",
        "https://core.example.com/api",
        "https://core.example.com?target=other",
        "https://core.example.com#fragment"
    ])("rejects unsafe base URL %s", (baseUrl) => {
        expect(() =>
            readIntegrationCoreClientConfiguration({
                INTEGRATION_CORE_BASE_URL: baseUrl,
                INTEGRATION_CORE_SOURCE_API_KEY: SOURCE_API_KEY
            })
        ).toThrow(
            "INTEGRATION_CORE_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment"
        );
    });

    it.each([undefined, "", "missing-separator", "key.secret with spaces"])(
        "rejects invalid source API key",
        (sourceApiKey) => {
            expect(() =>
                readIntegrationCoreClientConfiguration({
                    INTEGRATION_CORE_BASE_URL: "https://core.example.com",
                    INTEGRATION_CORE_SOURCE_API_KEY: sourceApiKey
                })
            ).toThrow("INTEGRATION_CORE_SOURCE_API_KEY must be a canonical source API key");
        }
    );

    it.each([
        ["INTEGRATION_CORE_TIMEOUT_MILLISECONDS", "99", "100", "30000"],
        ["INTEGRATION_CORE_TIMEOUT_MILLISECONDS", "30001", "100", "30000"],
        ["INTEGRATION_CORE_TIMEOUT_MILLISECONDS", "1.5", "100", "30000"],
        ["INTEGRATION_CORE_RETRY_AFTER_CAP_MILLISECONDS", "3600001", "0", "3600000"],
        ["INTEGRATION_CORE_RETRY_AFTER_CAP_MILLISECONDS", "-1", "0", "3600000"]
    ])("rejects invalid %s value %s", (name, value, minimum, maximum) => {
        expect(() =>
            readIntegrationCoreClientConfiguration({
                INTEGRATION_CORE_BASE_URL: "https://core.example.com",
                INTEGRATION_CORE_SOURCE_API_KEY: SOURCE_API_KEY,
                [name]: value
            })
        ).toThrow(`${name} must be an integer between ${minimum} and ${maximum}`);
    });
});
