import type {
    FastifyInstance,
    FastifyReply,
    preHandlerHookHandler
} from "fastify";

import type {
    OperatorJwtVerifier,
    OperatorPrincipal,
    OperatorRole
} from "./operator-jwt-verifier.js";

const MAX_BEARER_TOKEN_LENGTH = 8_192;
const BEARER_TOKEN_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

declare module "fastify" {
    interface FastifyRequest {
        operatorPrincipal: OperatorPrincipal | null;
    }
}

interface ProblemDetails {
    readonly detail: string;
    readonly status: number;
    readonly title: string;
    readonly type: string;
}

export type OperatorAuthorizationOptions =
    | { readonly enabled: false }
    | { readonly enabled: true; readonly verifyToken: OperatorJwtVerifier };

export type OperatorRoleGuard = (requiredRole: OperatorRole) => preHandlerHookHandler;

export function configureOperatorAuthorization(
    application: FastifyInstance,
    options: OperatorAuthorizationOptions
): OperatorRoleGuard {
    application.decorateRequest("operatorPrincipal", null);

    return (requiredRole) => async (request, reply) => {
        if (!options.enabled) {
            return;
        }

        const token = readBearerToken(request.headers.authorization);
        if (token === null) {
            sendAuthenticationFailure(reply);
            return;
        }

        let authentication;
        try {
            authentication = await options.verifyToken(token);
        } catch {
            request.log.warn("Operator identity provider unavailable");
            sendProblem(reply, 503, {
                type: "urn:problem:operator-identity-provider-unavailable",
                title: "Authentication service unavailable",
                detail: "Operator authentication could not be completed"
            });
            return;
        }

        if (!authentication.authenticated) {
            sendAuthenticationFailure(reply);
            return;
        }
        if (!hasRequiredRole(authentication.principal, requiredRole)) {
            sendProblem(reply, 403, {
                type: "urn:problem:operator-authorization",
                title: "Operator permission denied",
                detail: "The authenticated operator does not have the required permission"
            });
            return;
        }

        request.operatorPrincipal = authentication.principal;
    };
}

function readBearerToken(authorization: string | undefined): string | null {
    if (authorization === undefined || authorization.length > MAX_BEARER_TOKEN_LENGTH + 7) {
        return null;
    }
    return BEARER_TOKEN_PATTERN.exec(authorization)?.[1] ?? null;
}

function hasRequiredRole(principal: OperatorPrincipal, requiredRole: OperatorRole): boolean {
    return (
        principal.roles.has("platform-admin") ||
        (requiredRole === "operator" && principal.roles.has("operator"))
    );
}

function sendAuthenticationFailure(reply: FastifyReply): void {
    reply.header("WWW-Authenticate", 'Bearer realm="commerce-integration-hub"');
    sendProblem(reply, 401, {
        type: "urn:problem:operator-authentication",
        title: "Operator authentication failed",
        detail: "A valid operator bearer token is required"
    });
}

function sendProblem(
    reply: FastifyReply,
    status: 401 | 403 | 503,
    problem: Omit<ProblemDetails, "status">
): void {
    reply.code(status).type("application/problem+json").send({ ...problem, status });
}
