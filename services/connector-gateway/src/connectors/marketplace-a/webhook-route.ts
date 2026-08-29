import type { FastifyPluginCallback } from "fastify";

import type {
    MarketplaceAWebhookAuthenticationInput,
    MarketplaceAWebhookAuthenticator
} from "./webhook-authenticator.js";
import { configureMarketplaceARawJsonBodyParser } from "./raw-json-body-parser.js";

export const MARKETPLACE_A_WEBHOOK_PATH = "/providers/marketplace-a/v1/order-webhooks";

interface MarketplaceAWebhookHeaders {
    "x-webhook-key-id"?: string;
    "x-webhook-signature"?: string;
    "x-webhook-timestamp"?: string;
}

interface ProblemDetails {
    type: string;
    title: string;
    status: number;
    detail: string;
}

interface MarketplaceAWebhookRoute {
    Body: Buffer;
    Headers: MarketplaceAWebhookHeaders;
    Reply: ProblemDetails;
}

export interface MarketplaceAWebhookRouteOptions {
    authenticate: MarketplaceAWebhookAuthenticator;
}

const PROBLEM_DETAILS_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["type", "title", "status", "detail"],
    properties: {
        type: { type: "string" },
        title: { type: "string" },
        status: { type: "integer" },
        detail: { type: "string" }
    }
} as const;

export const marketplaceAWebhookRoute: FastifyPluginCallback<
    MarketplaceAWebhookRouteOptions
> = (application, { authenticate }, done) => {
    configureMarketplaceARawJsonBodyParser(application);

    application.post<MarketplaceAWebhookRoute>(
        MARKETPLACE_A_WEBHOOK_PATH,
        {
            schema: {
                response: {
                    401: PROBLEM_DETAILS_SCHEMA,
                    503: PROBLEM_DETAILS_SCHEMA
                }
            }
        },
        (request, reply) => {
            const authenticationInput: MarketplaceAWebhookAuthenticationInput = {
                keyId: request.headers["x-webhook-key-id"],
                rawBody: request.body,
                signatureHeader: request.headers["x-webhook-signature"],
                timestamp: request.headers["x-webhook-timestamp"]
            };
            const authentication = authenticate(authenticationInput);

            if (!authentication.authenticated) {
                reply
                    .code(401)
                    .type("application/problem+json")
                    .send({
                        type: "urn:problem:webhook-authentication",
                        title: "Webhook authentication failed",
                        status: 401,
                        detail: "The webhook credentials could not be verified"
                    });
                return;
            }

            reply
                .code(503)
                .type("application/problem+json")
                .send({
                    type: "urn:problem:gateway-unavailable",
                    title: "Gateway unavailable",
                    status: 503,
                    detail: "Durable webhook receipt is not available"
                });
        }
    );

    done();
};
