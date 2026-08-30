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
    readiness?: () => Promise<boolean>;
}

interface HealthResponse {
    status: "UP";
}

interface ReadinessResponse {
    checks: {
        database: "DOWN" | "UP";
    };
    status: "DOWN" | "UP";
}

const HEALTH_RESPONSE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: {
        status: { type: "string", const: "UP" }
    }
} as const;

const READINESS_RESPONSE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["status", "checks"],
    properties: {
        status: { type: "string", enum: ["DOWN", "UP"] },
        checks: {
            type: "object",
            additionalProperties: false,
            required: ["database"],
            properties: {
                database: { type: "string", enum: ["DOWN", "UP"] }
            }
        }
    }
} as const;

export function buildApplication(options: BuildApplicationOptions = {}): FastifyInstance {
    const application = Fastify({ logger: options.logger ?? false });

    const registerLiveness = (path: "/health" | "/health/live"): void => {
        application.get<{ Reply: HealthResponse }>(
            path,
            {
                schema: {
                    response: { 200: HEALTH_RESPONSE_SCHEMA }
                }
            },
            () => ({ status: "UP" })
        );
    };
    registerLiveness("/health");
    registerLiveness("/health/live");

    const readiness = options.readiness;
    if (readiness !== undefined) {
        application.get<{ Reply: ReadinessResponse }>(
            "/health/ready",
        {
            schema: {
                response: {
                        200: READINESS_RESPONSE_SCHEMA,
                        503: READINESS_RESPONSE_SCHEMA
                }
            }
        },
            async (_request, reply) => {
                const ready = await readiness();
                const status = ready ? "UP" : "DOWN";
                reply.code(ready ? 200 : 503);
                return { checks: { database: status }, status };
            }
        );
    }

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
