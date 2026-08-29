import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

import type { Kysely } from "kysely";

const CONNECTOR_A_ID = "0199037b-6400-7000-8000-000000000001";
const CONNECTOR_B_ID = "0199037b-6400-7000-8000-000000000002";
const DELIVERY_A_ID = "0199037b-6400-7000-8000-000000000003";
const DELIVERY_B_ID = "0199037b-6400-7000-8000-000000000004";
const DELIVERY_C_ID = "0199037b-6400-7000-8000-000000000005";
const PAYLOAD_HASH = "a".repeat(64);

describe("connector gateway database migration", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionString: container.getConnectionUri(),
            maxPoolSize: 2
        });
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("creates the delivery ledger and is repeatable", async () => {
        const firstRun = await migrateToLatest(database);
        const secondRun = await migrateToLatest(database);

        expect(firstRun).toEqual([
            expect.objectContaining({
                migrationName: "001_create_delivery_ledger",
                status: "Success"
            })
        ]);
        expect(secondRun).toEqual([]);

        const tables = await sql<{ table_name: string }>`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('connector_configurations', 'inbound_deliveries')
            ORDER BY table_name
        `.execute(database);

        expect(tables.rows.map(({ table_name: tableName }) => tableName)).toEqual([
            "connector_configurations",
            "inbound_deliveries"
        ]);
    });

    it("scopes external event uniqueness to the connector", async () => {
        await database
            .insertInto("connector_configurations")
            .values([
                connectorConfiguration(CONNECTOR_A_ID, "MARKETPLACE_A"),
                connectorConfiguration(CONNECTOR_B_ID, "ERP_B")
            ])
            .execute();

        await database
            .insertInto("inbound_deliveries")
            .values(inboundDelivery(DELIVERY_A_ID, CONNECTOR_A_ID))
            .execute();

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values(inboundDelivery(DELIVERY_B_ID, CONNECTOR_A_ID))
                .execute()
        ).rejects.toMatchObject({ code: "23505" });

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values(inboundDelivery(DELIVERY_C_ID, CONNECTOR_B_ID))
                .execute()
        ).resolves.toBeDefined();
    });

    it("rejects invalid connector and delivery data", async () => {
        await expect(
            database
                .insertInto("connector_configurations")
                .values({
                    ...connectorConfiguration("0199037b-6400-7000-8000-000000000006", "ERP_B"),
                    mode: "POLLING",
                    schedule: null
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values({
                    ...inboundDelivery(
                        "0199037b-6400-7000-8000-000000000007",
                        CONNECTOR_A_ID
                    ),
                    provider_payload_hash: "not-a-sha-256"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });
    });
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

function inboundDelivery(id: string, connectorId: string) {
    return {
        id,
        connector_id: connectorId,
        external_event_id: "evt-1001",
        provider_payload_hash: PAYLOAD_HASH,
        raw_payload: { eventId: "evt-1001" },
        canonical_payload: {
            externalId: "order-1001",
            currency: "EUR" as const,
            declaredTotalAmount: "39.98",
            items: [
                {
                    externalLineId: "line-1",
                    sku: "SKU-1",
                    quantity: "2",
                    unitPrice: "19.99"
                }
            ]
        },
        mapping_version: "marketplace-a-order-v1",
        lease_owner: null,
        lease_expires_at: null,
        error_code: null,
        safe_error_message: null,
        last_http_status: null,
        correlation_id: null,
        last_core_order_id: null,
        completed_at: null
    };
}
