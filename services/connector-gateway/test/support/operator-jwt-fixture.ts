import { exportJWK, generateKeyPair, SignJWT } from "jose";

export interface OperatorTokenOptions {
    readonly groups: readonly string[];
    readonly audience?: string;
    readonly issuer?: string;
    readonly subject?: string;
    readonly expiresAt?: number;
}

// Signing material is generated per run and remains in this process only.
export async function createOperatorJwtFixture(configuration: {
    readonly audience: string;
    readonly issuer: string;
    readonly keyId: string;
    readonly subject: string;
}) {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwks = {
        keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid: configuration.keyId, use: "sig" }]
    };
    return {
        jwks,
        issueToken: (options: OperatorTokenOptions): Promise<string> =>
            new SignJWT({ groups: options.groups })
                .setProtectedHeader({ alg: "RS256", kid: configuration.keyId })
                .setAudience(options.audience ?? configuration.audience)
                .setExpirationTime(options.expiresAt ?? Math.floor(Date.now() / 1_000) + 300)
                .setIssuedAt()
                .setIssuer(options.issuer ?? configuration.issuer)
                .setSubject(options.subject ?? configuration.subject)
                .sign(privateKey)
    };
}

export type OperatorJwtFixture = Awaited<ReturnType<typeof createOperatorJwtFixture>>;
