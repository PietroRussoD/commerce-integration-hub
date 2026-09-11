import { describe, expect, it } from "vitest";

import { readOperatorSecurityConfiguration } from "./operator-security-configuration.js";

const enabledEnvironment = {
    OPERATOR_AUTHORIZATION_ENABLED: "true",
    OPERATOR_OIDC_AUDIENCE: "integration-hub-operator-api",
    OPERATOR_OIDC_CLOCK_SKEW_SECONDS: "15",
    OPERATOR_OIDC_ENABLED: "true",
    OPERATOR_OIDC_ISSUER: "https://identity.example.test/realms/integration-hub",
    OPERATOR_OIDC_JWKS_URL: "https://identity.example.test/realms/integration-hub/jwks"
};

describe("readOperatorSecurityConfiguration", () => {
    it("keeps operator security disabled by default", () => {
        expect(readOperatorSecurityConfiguration({})).toEqual({
            authorizationEnabled: false,
            oidcEnabled: false
        });
    });

    it("reads an enabled resource-server configuration", () => {
        expect(readOperatorSecurityConfiguration(enabledEnvironment)).toEqual({
            audience: "integration-hub-operator-api",
            authorizationEnabled: true,
            clockToleranceSeconds: 15,
            issuer: "https://identity.example.test/realms/integration-hub",
            jwksUrl: new URL(
                "https://identity.example.test/realms/integration-hub/jwks"
            ),
            oidcEnabled: true
        });
    });

    it("uses the bounded default clock tolerance", () => {
        expect(
            readOperatorSecurityConfiguration({
                ...enabledEnvironment,
                OPERATOR_OIDC_CLOCK_SKEW_SECONDS: undefined
            })
        ).toMatchObject({ clockToleranceSeconds: 30 });
    });

    it("permits validation without route authorization", () => {
        expect(
            readOperatorSecurityConfiguration({
                ...enabledEnvironment,
                OPERATOR_AUTHORIZATION_ENABLED: "false"
            })
        ).toMatchObject({ authorizationEnabled: false, oidcEnabled: true });
    });

    it.each(["yes", "TRUE", "0"])("rejects the invalid boolean %s", (value) => {
        expect(() =>
            readOperatorSecurityConfiguration({ OPERATOR_OIDC_ENABLED: value })
        ).toThrow("OPERATOR_OIDC_ENABLED must be true or false");
    });

    it("rejects authorization without token validation", () => {
        expect(() =>
            readOperatorSecurityConfiguration({ OPERATOR_AUTHORIZATION_ENABLED: "true" })
        ).toThrow("OPERATOR_AUTHORIZATION_ENABLED requires OPERATOR_OIDC_ENABLED=true");
    });

    it.each([
        ["OPERATOR_OIDC_AUDIENCE", ""],
        ["OPERATOR_OIDC_AUDIENCE", " surrounding-space "],
        ["OPERATOR_OIDC_AUDIENCE", "a".repeat(201)],
        ["OPERATOR_OIDC_ISSUER", undefined],
        ["OPERATOR_OIDC_JWKS_URL", undefined],
        ["OPERATOR_OIDC_JWKS_URL", " https://identity.example.test/jwks"],
        ["OPERATOR_OIDC_ISSUER", "not-a-url"],
        ["OPERATOR_OIDC_ISSUER", "ftp://identity.example.test/issuer"],
        ["OPERATOR_OIDC_JWKS_URL", "https://user:password@identity.example.test/jwks"],
        ["OPERATOR_OIDC_JWKS_URL", "https://identity.example.test/jwks?tenant=unsafe"],
        ["OPERATOR_OIDC_JWKS_URL", "https://identity.example.test/jwks#unsafe"],
        ["OPERATOR_OIDC_CLOCK_SKEW_SECONDS", "-1"],
        ["OPERATOR_OIDC_CLOCK_SKEW_SECONDS", "301"]
    ])("rejects invalid %s", (name, value) => {
        expect(() =>
            readOperatorSecurityConfiguration({ ...enabledEnvironment, [name]: value })
        ).toThrow();
    });
});
