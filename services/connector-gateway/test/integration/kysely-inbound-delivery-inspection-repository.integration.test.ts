import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type {
    DeliveryProvider,
    InboundDeliveryStatus
} from "../../src/application/deliveries/list-inbound-deliveries.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryInspectionRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-inspection-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const MARKETPLACE_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000901";
const ERP_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000902";

describe("KyselyInboundDeliveryInspectionRepository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let repository: KyselyInboundDeliveryInspectionRepository;

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
                connectorConfiguration(MARKETPLACE_CONNECTOR_ID, "MARKETPLACE_A"),
                connectorConfiguration(ERP_CONNECTOR_ID, "ERP_B")
            ])
            .execute();
        repository = new KyselyInboundDeliveryInspectionRepository(database);
    });

    beforeEach(async () => {
        await database.deleteFrom("inbound_deliveries").execute();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("returns safe summaries in newest-first order", async () => {
        await insertDelivery("000000000911", "older", "EXHAUSTED", "2026-09-11T08:00:00.123456Z");
        await insertDelivery(
            "000000000912",
            "newer",
            "PERMANENT_FAILURE",
            "2026-09-11T09:00:00.654321Z"
        );

        const page = await repository.list({ limit: 20 });

        expect(page.nextCursor).toBeNull();
        expect(page.items.map(({ externalEventId }) => externalEventId)).toEqual([
            "newer",
            "older"
        ]);
        expect(page.items[0]).toEqual({
            attemptCount: 2,
            completedAt: new Date("2026-09-11T09:05:00.000Z"),
            correlationId: "0199037b-6400-7000-8000-000000000990",
            deliveryId: "0199037b-6400-7000-8000-000000000912",
            errorCode: "CORE_REQUEST_REJECTED",
            externalEventId: "newer",
            lastCoreOrderId: null,
            lastHttpStatus: 422,
            provider: "MARKETPLACE_A",
            receivedAt: new Date("2026-09-11T09:00:00.654Z"),
            sourceSystem: "MARKETPLACE_A",
            status: "PERMANENT_FAILURE",
            updatedAt: new Date("2026-09-11T09:05:00.000Z")
        });
        expect(page.items[0]).not.toHaveProperty("rawPayload");
        expect(page.items[0]).not.toHaveProperty("canonicalPayload");
        expect(page.items[0]).not.toHaveProperty("safeErrorMessage");
    });

    it("paginates equal microsecond timestamps without duplicates", async () => {
        const receivedAt = "2026-09-11T10:00:00.123456Z";
        await insertDelivery("000000000921", "event-1", "EXHAUSTED", receivedAt);
        await insertDelivery("000000000922", "event-2", "EXHAUSTED", receivedAt);
        await insertDelivery("000000000923", "event-3", "EXHAUSTED", receivedAt);

        const firstPage = await repository.list({ limit: 2 });
        const secondPage = await repository.list({ cursor: firstPage.nextCursor!, limit: 2 });

        expect(firstPage.items.map(({ externalEventId }) => externalEventId)).toEqual([
            "event-3",
            "event-2"
        ]);
        expect(firstPage.nextCursor).toEqual({
            deliveryId: "0199037b-6400-7000-8000-000000000922",
            receivedAt: "2026-09-11T10:00:00.123456Z"
        });
        expect(secondPage.items.map(({ externalEventId }) => externalEventId)).toEqual([
            "event-1"
        ]);
        expect(secondPage.nextCursor).toBeNull();
    });

    it("applies provider and status filters together", async () => {
        await insertDelivery("000000000931", "marketplace-failure", "EXHAUSTED", "2026-09-11T10:00:00Z");
        await insertDelivery("000000000932", "erp-failure", "EXHAUSTED", "2026-09-11T10:01:00Z", "ERP_B");
        await insertDelivery("000000000933", "erp-success", "DELIVERED", "2026-09-11T10:02:00Z", "ERP_B");

        const page = await repository.list({
            limit: 20,
            provider: "ERP_B",
            statuses: ["EXHAUSTED"]
        });

        expect(page.items).toHaveLength(1);
        expect(page.items[0]).toMatchObject({
            externalEventId: "erp-failure",
            provider: "ERP_B",
            status: "EXHAUSTED"
        });
    });

    async function insertDelivery(
        idSuffix: string,
        externalEventId: string,
        status: InboundDeliveryStatus,
        receivedAt: string,
        provider: DeliveryProvider = "MARKETPLACE_A"
    ): Promise<void> {
        const terminal = [
            "BLOCKED_CONFIGURATION",
            "DELIVERED",
            "EXHAUSTED",
            "PERMANENT_FAILURE"
        ].includes(status);
        const failed = status !== "DELIVERED";
        await database
            .insertInto("inbound_deliveries")
            .values({
                id: `0199037b-6400-7000-8000-${idSuffix}`,
                connector_id: provider === "ERP_B" ? ERP_CONNECTOR_ID : MARKETPLACE_CONNECTOR_ID,
                external_event_id: externalEventId,
                provider_payload_hash: "a".repeat(64),
                raw_payload: { privateProviderField: "not-for-operators" },
                canonical_payload: {
                    currency: "EUR",
                    declaredTotalAmount: "10.00",
                    externalId: `order-${externalEventId}`,
                    items: [
                        {
                            externalLineId: "line-1",
                            quantity: "1",
                            sku: "SKU-1",
                            unitPrice: "10.00"
                        }
                    ]
                },
                mapping_version: `${provider.toLowerCase()}-order-v1`,
                status,
                attempt_count: 2,
                next_attempt_at: new Date("2026-09-11T09:00:00.000Z"),
                lease_owner: null,
                lease_token: null,
                lease_expires_at: null,
                error_code: failed ? "CORE_REQUEST_REJECTED" : null,
                safe_error_message: failed ? "Internal detail excluded from list" : null,
                last_http_status: failed ? 422 : 201,
                correlation_id: "0199037b-6400-7000-8000-000000000990",
                last_core_order_id: null,
                received_at: sql<Date>`${receivedAt}::timestamptz`,
                updated_at: new Date("2026-09-11T09:05:00.000Z"),
                completed_at: terminal ? new Date("2026-09-11T09:05:00.000Z") : null
            })
            .execute();
    }
});

function connectorConfiguration(id: string, provider: DeliveryProvider) {
    return {
        id,
        provider,
        source_system: provider,
        mode: provider === "ERP_B" ? ("POLLING" as const) : ("WEBHOOK" as const),
        status: "ACTIVE" as const,
        schedule: provider === "ERP_B" ? "*/30 * * * * *" : null,
        secret_reference: `env:${provider}_SECRET`
    };
}
