import type { FastifyInstance } from "fastify";

export const MARKETPLACE_A_WEBHOOK_BODY_LIMIT_BYTES = 1_048_576;

export function configureMarketplaceARawJsonBodyParser(application: FastifyInstance): void {
    application.removeAllContentTypeParsers();
    application.addContentTypeParser(
        "application/json",
        {
            bodyLimit: MARKETPLACE_A_WEBHOOK_BODY_LIMIT_BYTES,
            parseAs: "buffer"
        },
        (_request, body, done) => done(null, body)
    );
}
