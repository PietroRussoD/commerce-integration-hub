import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    configureOperatorAuthorization,
    type OperatorAuthorizationOptions
} from "./operator-authorization.js";
import type {
    OperatorJwtVerifier,
    OperatorPrincipal,
    OperatorRole
} from "./operator-jwt-verifier.js";

const VALID_TOKEN = "header.payload.signature";
const applications: FastifyInstance[] = [];

afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe("configureOperatorAuthorization", () => {
    it.each([
        ["operator", "operator"],
        ["platform-admin", "operator"],
        ["platform-admin", "platform-admin"]
    ] as const)("allows %s to access a %s route", async (role, requiredRole) => {
        const principal = operatorPrincipal(role);
        const verifyToken = vi.fn<OperatorJwtVerifier>().mockResolvedValue({
            authenticated: true,
            principal
        });
        const application = buildProtectedApplication(
            { enabled: true, verifyToken },
            requiredRole
        );

        const response = await application.inject({
            headers: { authorization: `bEaReR ${VALID_TOKEN}` },
            method: "GET",
            url: "/operator"
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ subject: principal.subject });
        expect(verifyToken).toHaveBeenCalledWith(VALID_TOKEN);
    });

    it("returns 403 when an operator accesses a platform-admin route", async () => {
        const verifyToken = vi.fn<OperatorJwtVerifier>().mockResolvedValue({
            authenticated: true,
            principal: operatorPrincipal("operator")
        });
        const application = buildProtectedApplication(
            { enabled: true, verifyToken },
            "platform-admin"
        );

        const response = await application.inject({
            headers: { authorization: `Bearer ${VALID_TOKEN}` },
            method: "GET",
            url: "/operator"
        });

        expect(response.statusCode).toBe(403);
        expect(response.headers["content-type"]).toContain("application/problem+json");
        expect(response.headers["www-authenticate"]).toBeUndefined();
        expect(response.json()).toEqual({
            type: "urn:problem:operator-authorization",
            title: "Operator permission denied",
            status: 403,
            detail: "The authenticated operator does not have the required permission"
        });
    });

    it.each([
        undefined,
        "Basic credentials",
        "Bearer",
        "Bearer header.payload",
        "Bearer header.payload.signature extra",
        `Bearer ${"a".repeat(8_193)}`
    ])("returns 401 for the malformed authorization header %s", async (authorization) => {
        const verifyToken = vi.fn<OperatorJwtVerifier>();
        const application = buildProtectedApplication({ enabled: true, verifyToken }, "operator");

        const response = await application.inject({
            ...(authorization === undefined ? {} : { headers: { authorization } }),
            method: "GET",
            url: "/operator"
        });

        expect(response.statusCode).toBe(401);
        expect(response.headers["content-type"]).toContain("application/problem+json");
        expect(response.headers["www-authenticate"]).toBe(
            'Bearer realm="commerce-integration-hub"'
        );
        expect(response.json()).toEqual({
            type: "urn:problem:operator-authentication",
            title: "Operator authentication failed",
            status: 401,
            detail: "A valid operator bearer token is required"
        });
        expect(verifyToken).not.toHaveBeenCalled();
    });

    it("returns 401 when token verification fails", async () => {
        const verifyToken = vi
            .fn<OperatorJwtVerifier>()
            .mockResolvedValue({ authenticated: false });
        const application = buildProtectedApplication({ enabled: true, verifyToken }, "operator");

        const response = await application.inject({
            headers: { authorization: `Bearer ${VALID_TOKEN}` },
            method: "GET",
            url: "/operator"
        });

        expect(response.statusCode).toBe(401);
        expect(response.headers["www-authenticate"]).toBe(
            'Bearer realm="commerce-integration-hub"'
        );
    });

    it("returns 503 without exposing an identity-provider failure", async () => {
        const verifyToken = vi
            .fn<OperatorJwtVerifier>()
            .mockRejectedValue(new Error("private network detail"));
        const application = buildProtectedApplication({ enabled: true, verifyToken }, "operator");

        const response = await application.inject({
            headers: { authorization: `Bearer ${VALID_TOKEN}` },
            method: "GET",
            url: "/operator"
        });

        expect(response.statusCode).toBe(503);
        expect(response.body).not.toContain("private network detail");
        expect(response.json()).toEqual({
            type: "urn:problem:operator-identity-provider-unavailable",
            title: "Authentication service unavailable",
            status: 503,
            detail: "Operator authentication could not be completed"
        });
    });

    it("leaves local operator routes open when authorization is disabled", async () => {
        const application = buildProtectedApplication({ enabled: false }, "operator");

        const response = await application.inject({ method: "GET", url: "/operator" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ subject: null });
    });
});

function buildProtectedApplication(
    options: OperatorAuthorizationOptions,
    requiredRole: OperatorRole
): FastifyInstance {
    const application = Fastify({ logger: false });
    applications.push(application);
    const requireRole = configureOperatorAuthorization(application, options);
    application.get(
        "/operator",
        { preHandler: requireRole(requiredRole) },
        (request) => ({ subject: request.operatorPrincipal?.subject ?? null })
    );
    return application;
}

function operatorPrincipal(role: OperatorRole): OperatorPrincipal {
    return { roles: new Set([role]), subject: `subject-${role}` };
}
