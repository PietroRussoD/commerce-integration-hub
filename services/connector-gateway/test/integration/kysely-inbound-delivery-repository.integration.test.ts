import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ReceiveInboundDeliveryCommand } from "../../src/application/deliveries/receive-inbound-delivery-command.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000101";
const OTHER_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000102";
const PAYLOAD_HASH = "a".repeat(64);

const command: ReceiveInboundDeliveryCommand = {
    externalEventId: "evt-2001",
    providerPayloadHash: PAYLOAD_HASH,
    providerPayloadJson: JSON.stringify({ eventId: "evt-2001", orderNumber: "order-2001" }),
    mappingVersion: "marketplace-a-order-v1",
    canonicalOrder: {
        externalId: "order-2001",
        currency: "EUR",
        declaredTotalAmount: "39.98",
        items: [
            {
                externalLineId: "line-1",
                sku: "SKU-1",
                quantity: "2",
                unitPrice: "19.99"
            }
        ]
    }
};

describe("KyselyInboundDeliveryRepository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let repository: KyselyInboundDeliveryRepository;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 8
        });
        await migrateToLatest(database);
        await database
            .insertInto("connector_configurations")
            .values([
                connectorConfiguration(CONNECTOR_ID, "MARKETPLACE_A"),
                connectorConfiguration(OTHER_CONNECTOR_ID, "ERP_B")
            ])
            .execute();
        repository = new KyselyInboundDeliveryRepository(database);
    });

    beforeEach(async () => {
        await database.deleteFrom("inbound_deliveries").execute();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("creates a durable delivery with provider and canonical payloads", async () => {
        const result = await repository.receive(CONNECTOR_ID, command);

        expect(result.outcome).toBe("CREATED");
        expect(result.deliveryId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );

        const stored = await database
            .selectFrom("inbound_deliveries")
            .selectAll()
            .executeTakeFirstOrThrow();

        expect(stored).toMatchObject({
            id: result.deliveryId,
            connector_id: CONNECTOR_ID,
            external_event_id: command.externalEventId,
            provider_payload_hash: PAYLOAD_HASH,
            raw_payload: { eventId: "evt-2001", orderNumber: "order-2001" },
            canonical_payload: command.canonicalOrder,
            mapping_version: command.mappingVersion,
            status: "RECEIVED",
            attempt_count: 0
        });
    });

    it("returns the original identity for an equivalent replay", async () => {
        const created = await repository.receive(CONNECTOR_ID, command);
        const replay = await repository.receive(CONNECTOR_ID, command);

        expect(replay).toEqual({
            deliveryId: created.deliveryId,
            outcome: "EQUIVALENT_REPLAY"
        });
        await expect(deliveryCount()).resolves.toBe(1);
    });

    it("reports a payload conflict without replacing the original delivery", async () => {
        const created = await repository.receive(CONNECTOR_ID, command);
        const conflict = await repository.receive(CONNECTOR_ID, {
            ...command,
            providerPayloadHash: "b".repeat(64),
            providerPayloadJson: JSON.stringify({
                eventId: "evt-2001",
                orderNumber: "different-order"
            })
        });

        expect(conflict).toEqual({
            deliveryId: created.deliveryId,
            outcome: "PAYLOAD_CONFLICT"
        });

        const stored = await database
            .selectFrom("inbound_deliveries")
            .select(["provider_payload_hash", "raw_payload"])
            .executeTakeFirstOrThrow();
        expect(stored).toEqual({
            provider_payload_hash: PAYLOAD_HASH,
            raw_payload: { eventId: "evt-2001", orderNumber: "order-2001" }
        });
    });

    it("allows the same provider event identity for another connector", async () => {
        const first = await repository.receive(CONNECTOR_ID, command);
        const second = await repository.receive(OTHER_CONNECTOR_ID, command);

        expect(first.outcome).toBe("CREATED");
        expect(second.outcome).toBe("CREATED");
        expect(second.deliveryId).not.toBe(first.deliveryId);
        await expect(deliveryCount()).resolves.toBe(2);
    });

    it("classifies concurrent equivalent receipts with one stable identity", async () => {
        const results = await Promise.all(
            Array.from({ length: 8 }, () => repository.receive(CONNECTOR_ID, command))
        );

        expect(results.filter(({ outcome }) => outcome === "CREATED")).toHaveLength(1);
        expect(results.filter(({ outcome }) => outcome === "EQUIVALENT_REPLAY")).toHaveLength(7);
        expect(new Set(results.map(({ deliveryId }) => deliveryId))).toHaveLength(1);
        await expect(deliveryCount()).resolves.toBe(1);
    });

    it("propagates a missing connector failure", async () => {
        await expect(
            repository.receive("0199037b-6400-7000-8000-000000000199", command)
        ).rejects.toMatchObject({ code: "23503" });
    });

    async function deliveryCount(): Promise<number> {
        const result = await database
            .selectFrom("inbound_deliveries")
            .select(({ fn }) => fn.countAll<number>().as("count"))
            .executeTakeFirstOrThrow();
        return Number(result.count);
    }
});

function connectorConfiguration(id: string, provider: "ERP_B" | "MARKETPLACE_A") {
    return {
        id,
        provider,
        source_system: provider,
        mode: "WEBHOOK" as const,
        status: "ACTIVE" as const,
        schedule: null,
        secret_reference: `env:${provider}_WEBHOOK_SECRET`
    };
}
