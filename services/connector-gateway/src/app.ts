import Fastify, { type FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";

import type { MetricsExporter } from "./infrastructure/observability/connector-gateway-metrics.js";
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

    application.register(fastifySwagger, {
        mode: "dynamic",
        openapi: {
            info: {
                title: "Commerce Integration Hub Connector Gateway API",
                version: "1.0.0-SNAPSHOT",
                description: "Provider-facing connector and operational health API."
            }
        }
    });

    application.get("/openapi.json", () => application.swagger());

    application.register((instance, _options, done) => {
        const registerLiveness = (path: "/health" | "/health/live"): void => {
            instance.get<{ Reply: HealthResponse }>(
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
            instance.get<{ Reply: ReadinessResponse }>(
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
            instance.get("/metrics", (_request, reply) => {
                reply.header("Cache-Control", "no-store");
                reply.type(options.metrics!.contentType);
                return options.metrics!.metrics();
            });
        }

        if (options.marketplaceAWebhook !== undefined) {
            instance.register(marketplaceAWebhookRoute, options.marketplaceAWebhook);
        }
        done();
    });

    return application;
}
