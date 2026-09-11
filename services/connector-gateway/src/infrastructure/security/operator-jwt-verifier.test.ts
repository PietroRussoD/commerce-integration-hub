import { generateKeyPair, type KeyObject } from "node:crypto";

import { createLocalJWKSet, exportJWK, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createOperatorJwtVerifier } from "./operator-jwt-verifier.js";
import type { OperatorSecurityConfiguration } from "./operator-security-configuration.js";

const AUDIENCE = "integration-hub-operator-api";
const ISSUER = "https://identity.example.test/realms/integration-hub";
const KEY_ID = "operator-test-key";
const NOW_SECONDS = Math.floor(Date.now() / 1_000);

const configuration: Extract<OperatorSecurityConfiguration, { oidcEnabled: true }> = {
    audience: AUDIENCE,
    authorizationEnabled: true,
    clockToleranceSeconds: 0,
    issuer: ISSUER,
    jwksUrl: new URL("https://identity.example.test/jwks"),
    oidcEnabled: true
};

describe("createOperatorJwtVerifier", () => {
    let privateKey: KeyObject;
    let verifier: ReturnType<typeof createOperatorJwtVerifier>;

    beforeAll(async () => {
        const keyPair = await generateRsaKeyPair();
        privateKey = keyPair.privateKey;
        verifier = createOperatorJwtVerifier(
            configuration,
            createLocalJWKSet({ keys: [keyPair.publicJwk] })
        );
    });

    it("authenticates a signed token and retains only supported roles", async () => {
        const token = await signToken({
            groups: ["operator", "unrelated-role", "platform-admin"],
            sub: "operator-123"
        });

        const result = await verifier(token);

        expect(result.authenticated).toBe(true);
        if (result.authenticated) {
            expect(result.principal.subject).toBe("operator-123");
            expect([...result.principal.roles]).toEqual(["operator", "platform-admin"]);
        }
    });

    it("authenticates a valid identity without application roles", async () => {
        const result = await verifier(await signToken({ sub: "operator-123" }));

        expect(result).toEqual({
            authenticated: true,
            principal: { roles: new Set(), subject: "operator-123" }
        });
    });

    it.each([
        { audience: "another-api", sub: "operator-123" },
        { issuer: "https://another-issuer.example.test", sub: "operator-123" },
        { expirationTime: NOW_SECONDS - 1, sub: "operator-123" },
        { expirationTime: null, sub: "operator-123" },
        { sub: undefined },
        { groups: "operator", sub: "operator-123" },
        { groups: ["operator", 42], sub: "operator-123" },
        { groups: Array.from({ length: 51 }, () => "operator"), sub: "operator-123" },
        { groups: [""], sub: "operator-123" },
        { groups: ["a".repeat(101)], sub: "operator-123" }
    ])("rejects invalid claims %#", async (overrides) => {
        await expect(verifier(await signToken(overrides))).resolves.toEqual({
            authenticated: false
        });
    });

    it("rejects a token signed by an unknown key", async () => {
        const otherKeyPair = await generateRsaKeyPair("other-key");
        const token = await signToken({ sub: "operator-123" }, otherKeyPair.privateKey);

        await expect(verifier(token)).resolves.toEqual({ authenticated: false });
    });

    it("propagates an unexpected key resolver failure", async () => {
        const failure = new Error("JWKS network unavailable");
        const failingVerifier = createOperatorJwtVerifier(configuration, () =>
            Promise.reject(failure)
        );

        await expect(failingVerifier(await signToken({ sub: "operator-123" }))).rejects.toBe(
            failure
        );
    });

    async function signToken(
        overrides: {
            audience?: string;
            expirationTime?: number | null;
            groups?: unknown;
            issuer?: string;
            sub?: string | undefined;
        },
        signingKey = privateKey
    ): Promise<string> {
        const token = new SignJWT(
            overrides.groups === undefined ? {} : { groups: overrides.groups }
        )
            .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
            .setAudience(overrides.audience ?? AUDIENCE)
            .setIssuer(overrides.issuer ?? ISSUER)
            .setIssuedAt(NOW_SECONDS);
        if (overrides.expirationTime !== null) {
            token.setExpirationTime(overrides.expirationTime ?? NOW_SECONDS + 300);
        }
        if (overrides.sub !== undefined) {
            token.setSubject(overrides.sub);
        }
        return token.sign(signingKey);
    }
});

async function generateRsaKeyPair(keyId = KEY_ID): Promise<{
    privateKey: KeyObject;
    publicJwk: JWK;
}> {
    const { privateKey, publicKey } = await new Promise<{
        privateKey: KeyObject;
        publicKey: KeyObject;
    }>((resolve, reject) => {
        generateKeyPair(
            "rsa",
            { modulusLength: 2_048 },
            (error, generatedPublicKey, generatedPrivateKey) => {
                if (error === null) {
                    resolve({ privateKey: generatedPrivateKey, publicKey: generatedPublicKey });
                } else {
                    reject(error);
                }
            }
        );
    });
    return {
        privateKey,
        publicJwk: { ...(await exportJWK(publicKey)), alg: "RS256", kid: keyId, use: "sig" }
    };
}
