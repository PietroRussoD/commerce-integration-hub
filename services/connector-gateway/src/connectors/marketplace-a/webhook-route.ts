import type { FastifyPluginCallback } from "fastify";

import type { ReceiveInboundDeliveryUseCase } from "../../application/deliveries/receive-inbound-delivery.js";
import { createMarketplaceAInboundDeliveryCommand } from "./webhook-receipt-command.js";
import type {
    MarketplaceAWebhookAuthenticationInput,
    MarketplaceAWebhookAuthenticator
} from "./webhook-authenticator.js";
import { mapMarketplaceAWebhookPayload } from "./webhook-payload-mapper.js";
import { parseMarketplaceAWebhookPayload } from "./webhook-payload-parser.js";
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
    Reply: ProblemDetails | WebhookAccepted;
}

export interface MarketplaceAWebhookRouteOptions {
    authenticate: MarketplaceAWebhookAuthenticator;
    receiveInboundDelivery: ReceiveInboundDeliveryUseCase;
}

interface WebhookAccepted {
    deliveryId: string;
    status: "ACCEPTED";
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

const WEBHOOK_ACCEPTED_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["deliveryId", "status"],
    properties: {
        deliveryId: { type: "string", format: "uuid" },
        status: { type: "string", const: "ACCEPTED" }
    }
} as const;

export const marketplaceAWebhookRoute: FastifyPluginCallback<
    MarketplaceAWebhookRouteOptions
> = (application, { authenticate, receiveInboundDelivery }, done) => {
    configureMarketplaceARawJsonBodyParser(application);

    application.post<MarketplaceAWebhookRoute>(
        MARKETPLACE_A_WEBHOOK_PATH,
        {
            schema: {
                response: {
                    202: WEBHOOK_ACCEPTED_SCHEMA,
                    400: PROBLEM_DETAILS_SCHEMA,
                    401: PROBLEM_DETAILS_SCHEMA,
                    409: PROBLEM_DETAILS_SCHEMA,
                    422: PROBLEM_DETAILS_SCHEMA,
                    503: PROBLEM_DETAILS_SCHEMA
                }
            }
        },
        async (request, reply) => {
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

            const parsing = parseMarketplaceAWebhookPayload(request.body);
            if (!parsing.valid) {
                reply
                    .code(400)
                    .type("application/problem+json")
                    .send({
                        type: "urn:problem:invalid-provider-payload",
                        title: "Invalid provider payload",
                        status: 400,
                        detail: "The webhook payload does not match the MARKETPLACE_A contract"
                    });
                return;
            }

            const mapping = mapMarketplaceAWebhookPayload(parsing.payload);
            if (!mapping.mapped) {
                reply
                    .code(422)
                    .type("application/problem+json")
                    .send({
                        type: "urn:problem:unsupported-provider-content",
                        title: "Unsupported provider content",
                        status: 422,
                        detail: "The webhook payload cannot be mapped to a canonical order"
                    });
                return;
            }

            try {
                const result = await receiveInboundDelivery(
                    createMarketplaceAInboundDeliveryCommand(request.body, mapping.value)
                );

                if (result.outcome === "PAYLOAD_CONFLICT") {
                    reply
                        .code(409)
                        .type("application/problem+json")
                        .send({
                            type: "urn:problem:provider-event-conflict",
                            title: "Provider event conflict",
                            status: 409,
                            detail: "The provider event identity was already used for different content"
                        });
                    return;
                }

                if (result.outcome === "EQUIVALENT_REPLAY") {
                    reply.header("Idempotent-Replay", "true");
                }
                reply.code(202).send({ deliveryId: result.deliveryId, status: "ACCEPTED" });
            } catch (error) {
                request.log.error({ err: error }, "Failed to persist inbound delivery");
                reply
                    .code(503)
                    .type("application/problem+json")
                    .send({
                        type: "urn:problem:gateway-unavailable",
                        title: "Gateway unavailable",
                        status: 503,
                        detail: "The webhook delivery could not be persisted"
                    });
            }
        }
    );

    done();
};
