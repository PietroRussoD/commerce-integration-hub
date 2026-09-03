import { describe, expect, it } from "vitest";

import { readProviderSimulatorConfiguration } from "./configuration.js";

describe("readProviderSimulatorConfiguration", () => {
    it("reads required credentials with local server defaults", () => {
        expect(
            readProviderSimulatorConfiguration({
                PROVIDER_SIMULATOR_ERP_B_API_TOKEN: "local-token"
            })
        ).toEqual({ erpBApiToken: "local-token", erpBScenario: "MIXED", host: "0.0.0.0", port: 8080 });
    });

    it("accepts explicit host and port", () => {
        expect(
            readProviderSimulatorConfiguration({
                HOST: "127.0.0.1",
                PORT: "18083",
                PROVIDER_SIMULATOR_ERP_B_API_TOKEN: "local-token",
                PROVIDER_SIMULATOR_ERP_B_SCENARIO: "SUCCESS"
            })
        ).toMatchObject({ erpBScenario: "SUCCESS", host: "127.0.0.1", port: 18083 });
    });

    it.each(["MIXED", "SUCCESS", "POISON_ITEM"])("accepts the %s ERP_B scenario", (scenario) => {
        expect(
            readProviderSimulatorConfiguration({
                PROVIDER_SIMULATOR_ERP_B_API_TOKEN: "local-token",
                PROVIDER_SIMULATOR_ERP_B_SCENARIO: scenario
            }).erpBScenario
        ).toBe(scenario);
    });

    it.each(["", "success", "UNKNOWN"])("rejects the %s ERP_B scenario", (scenario) => {
        expect(() =>
            readProviderSimulatorConfiguration({
                PROVIDER_SIMULATOR_ERP_B_API_TOKEN: "local-token",
                PROVIDER_SIMULATOR_ERP_B_SCENARIO: scenario
            })
        ).toThrow("PROVIDER_SIMULATOR_ERP_B_SCENARIO must be one of: MIXED, SUCCESS, POISON_ITEM");
    });

    it.each([undefined, "", "token with spaces", "a".repeat(2_049)])(
        "rejects invalid token %s",
        (token) => {
            expect(() =>
                readProviderSimulatorConfiguration({
                    PROVIDER_SIMULATOR_ERP_B_API_TOKEN: token
                })
            ).toThrow("PROVIDER_SIMULATOR_ERP_B_API_TOKEN");
        }
    );

    it.each(["", " padded", "a".repeat(256)])("rejects invalid host %s", (host) => {
        expect(() =>
            readProviderSimulatorConfiguration({
                HOST: host,
                PROVIDER_SIMULATOR_ERP_B_API_TOKEN: "local-token"
            })
        ).toThrow("HOST must contain between 1 and 255 non-padded characters");
    });

    it.each(["0", "1.5", "65536", "not-a-port"])("rejects invalid port %s", (port) => {
        expect(() =>
            readProviderSimulatorConfiguration({
                PORT: port,
                PROVIDER_SIMULATOR_ERP_B_API_TOKEN: "local-token"
            })
        ).toThrow("PORT must be an integer between 1 and 65535");
    });
});
