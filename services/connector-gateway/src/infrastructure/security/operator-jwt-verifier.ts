import {
    createRemoteJWKSet,
    errors,
    jwtVerify,
    type JWTVerifyGetKey
} from "jose";

import type { OperatorSecurityConfiguration } from "./operator-security-configuration.js";

const ACCEPTED_ALGORITHM = "RS256";
const MAX_SUBJECT_LENGTH = 200;

export type OperatorRole = "operator" | "platform-admin";

export interface OperatorPrincipal {
    readonly roles: ReadonlySet<OperatorRole>;
    readonly subject: string;
}

export type OperatorAuthenticationResult =
    | { readonly authenticated: false }
    | { readonly authenticated: true; readonly principal: OperatorPrincipal };

export type OperatorJwtVerifier = (token: string) => Promise<OperatorAuthenticationResult>;

class InvalidOperatorTokenError extends Error {}

export function createOperatorJwtVerifier(
    configuration: Extract<OperatorSecurityConfiguration, { oidcEnabled: true }>,
    resolveKey: JWTVerifyGetKey = createRemoteJWKSet(configuration.jwksUrl)
): OperatorJwtVerifier {
    return async (token) => {
        try {
            const { payload } = await jwtVerify(token, resolveKey, {
                algorithms: [ACCEPTED_ALGORITHM],
                audience: configuration.audience,
                clockTolerance: configuration.clockToleranceSeconds,
                issuer: configuration.issuer
            });
            return {
                authenticated: true,
                principal: {
                    roles: readRoles(payload.groups),
                    subject: readSubject(payload.sub)
                }
            };
        } catch (error) {
            if (error instanceof errors.JOSEError || error instanceof InvalidOperatorTokenError) {
                return { authenticated: false };
            }
            throw error;
        }
    };
}

function readSubject(subject: string | undefined): string {
    if (
        subject === undefined ||
        subject.length === 0 ||
        subject.length > MAX_SUBJECT_LENGTH ||
        subject !== subject.trim()
    ) {
        throw new InvalidOperatorTokenError("JWT subject is invalid");
    }
    return subject;
}

function readRoles(groups: unknown): ReadonlySet<OperatorRole> {
    if (groups === undefined) {
        return new Set();
    }
    if (!Array.isArray(groups) || !groups.every((group) => typeof group === "string")) {
        throw new InvalidOperatorTokenError("JWT groups claim is invalid");
    }
    return new Set(
        groups.filter(
            (group): group is OperatorRole =>
                group === "operator" || group === "platform-admin"
        )
    );
}
