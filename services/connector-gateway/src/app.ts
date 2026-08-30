import Fastify, { type FastifyInstance } from "fastify";

import type { MetricsExporter } from "./infrastructure/observability/delivery-worker-metrics.js";
import {
    type MarketplaceAWebhookRouteOptions,
    marketplaceAWebhookRoute
} from "./connectors/marketplace-a/webhook-route.js";

export interface BuildApplicationOptions {
    logger?: boolean;
    marketplaceAWebhook?: MarketplaceAWebhookRouteOptions;
    metrics?: MetricsExporter;
}

interface HealthResponse {
    status: "UP";
}

export function buildApplication(options: BuildApplicationOptions = {}): FastifyInstance {
    const application = Fastify({ logger: options.logger ?? false });

    application.get<{ Reply: HealthResponse }>(
        "/health",
        {
            schema: {
                response: {
                    200: {
                        type: "object",
                        additionalProperties: false,
                        required: ["status"],
                        properties: {
                            status: { type: "string", const: "UP" }
                        }
                    }
                }
            }
        },
        () => ({ status: "UP" })
    );

    if (options.metrics !== undefined) {
        application.get("/metrics", async (_request, reply) => {
            reply.header("Cache-Control", "no-store");
            reply.type(options.metrics!.contentType);
            return options.metrics!.metrics();
        });
    }

    if (options.marketplaceAWebhook !== undefined) {
        application.register(marketplaceAWebhookRoute, options.marketplaceAWebhook);
    }

    return application;
}
