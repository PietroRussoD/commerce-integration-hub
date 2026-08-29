import Fastify, { type FastifyInstance } from "fastify";

export interface BuildApplicationOptions {
    logger?: boolean;
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

    return application;
}
