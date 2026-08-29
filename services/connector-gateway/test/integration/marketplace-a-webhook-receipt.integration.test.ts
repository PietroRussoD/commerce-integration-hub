import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApplication } from "../../src/app.js";
import { createReceiveInboundDeliveryUseCase } from "../../src/application/deliveries/receive-inbound-delivery.js";
import { readMarketplaceAConnectorId } from "../../src/connectors/marketplace-a/connector-configuration.js";
import { MARKETPLACE_A_WEBHOOK_PATH } from "../../src/connectors/marketplace-a/webhook-route.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const VALID_PAYLOAD = JSON.stringify({
    eventId: "evt-http-1",
    eventType: "order.created",
    order: {
        orderNumber: "MA-HTTP-1",
        currency: "EUR",
        totalCents: 3998,
        lines: [
            {
                lineNumber: "1",
                productCode: "SKU-BOOK-1",
                quantity: 2,
                unitPriceCents: 1999
            }
        ]
    }
});

describe("MARKETPLACE_A durable webhook receipt", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let application: FastifyInstance;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionString: container.getConnectionUri(),
            maxPoolSize: 4
        });
        await migrateToLatest(database);

        application = buildApplication({
            marketplaceAWebhook: {
                authenticate: () => ({ authenticated: true }),
                receiveInboundDelivery: createReceiveInboundDeliveryUseCase({
                    connectorId: readMarketplaceAConnectorId({}),
                    repository: new KyselyInboundDeliveryRepository(database)
                })
            }
        });
    });

    afterAll(async () => {
        await application?.close();
        await database?.destroy();
        await container?.stop();
    });

    it("accepts first receipt and replay but rejects conflicting bytes", async () => {
        const first = await postWebhook(VALID_PAYLOAD);
        const replay = await postWebhook(VALID_PAYLOAD);
        const conflict = await postWebhook(`${VALID_PAYLOAD}\n`);

        expect(first.statusCode).toBe(202);
        expect(replay.statusCode).toBe(202);
        expect(replay.headers["idempotent-replay"]).toBe("true");
        expect(replay.json()).toEqual(first.json());
        expect(conflict.statusCode).toBe(409);

        const deliveries = await database
            .selectFrom("inbound_deliveries")
            .select(["id", "external_event_id", "provider_payload_hash", "status"])
            .execute();
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]).toMatchObject({
            id: first.json<{ deliveryId: string }>().deliveryId,
            external_event_id: "evt-http-1",
            status: "RECEIVED"
        });
    });

    function postWebhook(payload: string) {
        return application.inject({
            method: "POST",
            url: MARKETPLACE_A_WEBHOOK_PATH,
            headers: { "content-type": "application/json" },
            payload
        });
    }
});
