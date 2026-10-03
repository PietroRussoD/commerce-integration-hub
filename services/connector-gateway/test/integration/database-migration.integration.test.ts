import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";
import * as alignDeliveryLifecycleStates from "../../src/infrastructure/database/migrations/005_align_delivery_lifecycle_states.js";

import type { Kysely } from "kysely";

const CONNECTOR_A_ID = "0199037b-6400-7000-8000-000000000201";
const CONNECTOR_B_ID = "0199037b-6400-7000-8000-000000000202";
const DELIVERY_A_ID = "0199037b-6400-7000-8000-000000000203";
const DELIVERY_B_ID = "0199037b-6400-7000-8000-000000000204";
const DELIVERY_C_ID = "0199037b-6400-7000-8000-000000000205";
const ERP_B_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const PAYLOAD_HASH = "a".repeat(64);

describe("connector gateway database migration", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
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
            }),
            expect.objectContaining({
                migrationName: "002_seed_marketplace_a_connector",
                status: "Success"
            }),
            expect.objectContaining({
                migrationName: "003_add_delivery_lease_token",
                status: "Success"
            }),
            expect.objectContaining({
                migrationName: "004_create_delivery_attempts",
                status: "Success"
            }),
            expect.objectContaining({
                migrationName: "005_align_delivery_lifecycle_states",
                status: "Success"
            }),
            expect.objectContaining({
                migrationName: "006_add_erp_b_polling_storage",
                status: "Success"
            }),
            expect.objectContaining({
                migrationName: "007_create_operator_command_audit",
                status: "Success"
            }),
            expect.objectContaining({
                migrationName: "008_add_delivery_trace_context",
                status: "Success"
            })
        ]);
        expect(secondRun).toEqual([]);

        const tables = await sql<{ table_name: string }>`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                  'connector_configurations',
                  'delivery_attempts',
                  'inbound_deliveries',
                  'operator_command_audit_entries',
                  'polling_checkpoints'
              )
            ORDER BY table_name
        `.execute(database);

        expect(tables.rows.map(({ table_name: tableName }) => tableName)).toEqual([
            "connector_configurations",
            "delivery_attempts",
            "inbound_deliveries",
            "operator_command_audit_entries",
            "polling_checkpoints"
        ]);

        const seededConnector = await database
            .selectFrom("connector_configurations")
            .select(["id", "provider", "secret_reference"])
            .where("id", "=", "0199037b-6400-7000-8000-000000000001")
            .executeTakeFirstOrThrow();
        expect(seededConnector).toEqual({
            id: "0199037b-6400-7000-8000-000000000001",
            provider: "MARKETPLACE_A",
            secret_reference: "env:MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64"
        });

        const seededPollingConnector = await database
            .selectFrom("connector_configurations as connector")
            .innerJoin("polling_checkpoints as checkpoint", "checkpoint.connector_id", "connector.id")
            .select([
                "connector.id",
                "connector.mode",
                "connector.provider",
                "connector.schedule",
                "checkpoint.cursor",
                "checkpoint.version"
            ])
            .where("connector.id", "=", ERP_B_CONNECTOR_ID)
            .executeTakeFirstOrThrow();
        expect(seededPollingConnector).toEqual({
            id: ERP_B_CONNECTOR_ID,
            mode: "POLLING",
            provider: "ERP_B",
            schedule: "interval:PT30S",
            cursor: null,
            version: 1
        });
    });

    it("enforces polling checkpoint cursor, lease and time invariants", async () => {
        const updatedAt = new Date("2026-09-01T08:00:00.000Z");

        await expect(
            database
                .updateTable("polling_checkpoints")
                .set({ lease_owner: "poller-a", updated_at: updatedAt })
                .where("connector_id", "=", ERP_B_CONNECTOR_ID)
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .updateTable("polling_checkpoints")
                .set({ cursor: "   ", updated_at: updatedAt })
                .where("connector_id", "=", ERP_B_CONNECTOR_ID)
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .updateTable("polling_checkpoints")
                .set({
                    last_polled_at: updatedAt,
                    last_successful_poll_at: new Date("2026-09-01T08:00:01.000Z"),
                    updated_at: updatedAt
                })
                .where("connector_id", "=", ERP_B_CONNECTOR_ID)
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .updateTable("polling_checkpoints")
                .set({
                    cursor: "opaque-cursor-43",
                    last_polled_at: updatedAt,
                    last_successful_poll_at: updatedAt,
                    lease_owner: "poller-a",
                    lease_token: "0199037b-6400-7000-8000-000000000301",
                    lease_expires_at: new Date("2026-09-01T08:01:00.000Z"),
                    updated_at: updatedAt,
                    version: 2
                })
                .where("connector_id", "=", ERP_B_CONNECTOR_ID)
                .executeTakeFirst()
        ).resolves.toBeDefined();
    });

    it("allows only bounded permanent ERP_B rejections without a canonical payload", async () => {
        const rejectedDelivery = {
            ...inboundDelivery("0199037b-6400-7000-8000-000000000302", ERP_B_CONNECTOR_ID),
            canonical_payload: null,
            completed_at: new Date("2026-09-01T08:00:00.000Z"),
            error_code: "ERP_B_UNSUPPORTED_CURRENCY",
            external_event_id: "chg-poison-1",
            status: "PERMANENT_FAILURE" as const
        };

        await expect(
            database.insertInto("inbound_deliveries").values(rejectedDelivery).execute()
        ).resolves.toBeDefined();

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values({
                    ...rejectedDelivery,
                    id: "0199037b-6400-7000-8000-000000000303",
                    error_code: null,
                    external_event_id: "chg-poison-2"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values({
                    ...rejectedDelivery,
                    id: "0199037b-6400-7000-8000-000000000304",
                    error_code: "UNBOUNDED_PROVIDER_ERROR",
                    external_event_id: "chg-poison-3"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });
    });

    it("enforces the delivery-attempt lifecycle", async () => {
        const deliveryId = "0199037b-6400-7000-8000-000000000211";
        await database
            .insertInto("inbound_deliveries")
            .values(
                inboundDelivery(deliveryId, "0199037b-6400-7000-8000-000000000001")
            )
            .execute();

        const openAttempt = deliveryAttempt(
            "0199037b-6400-7000-8000-000000000212",
            deliveryId,
            1
        );
        await database.insertInto("delivery_attempts").values(openAttempt).execute();

        await expect(
            database
                .insertInto("delivery_attempts")
                .values(
                    deliveryAttempt(
                        "0199037b-6400-7000-8000-000000000213",
                        deliveryId,
                        0
                    )
                )
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("delivery_attempts")
                .values({
                    ...deliveryAttempt(
                        "0199037b-6400-7000-8000-000000000216",
                        deliveryId,
                        3
                    ),
                    completed_at: new Date("2026-08-30T08:00:00.125Z"),
                    duration_ms: 125,
                    outcome: "DELIVERED"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("delivery_attempts")
                .values({
                    ...deliveryAttempt(
                        "0199037b-6400-7000-8000-000000000214",
                        deliveryId,
                        2
                    ),
                    outcome: "RETRYABLE_FAILURE"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("delivery_attempts")
                .values({
                    ...deliveryAttempt(
                        "0199037b-6400-7000-8000-000000000215",
                        deliveryId,
                        1
                    )
                })
                .execute()
        ).rejects.toMatchObject({ code: "23505" });

        await database
            .updateTable("delivery_attempts")
            .set({
                completed_at: new Date("2026-08-30T08:00:00.125Z"),
                duration_ms: 125,
                http_status: 201,
                outcome: "DELIVERED"
            })
            .where("id", "=", openAttempt.id)
            .execute();

        await expect(
            database
                .selectFrom("delivery_attempts")
                .select([
                    "attempt_number",
                    "completed_at",
                    "duration_ms",
                    "http_status",
                    "outcome"
                ])
                .where("id", "=", openAttempt.id)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            attempt_number: 1,
            completed_at: new Date("2026-08-30T08:00:00.125Z"),
            duration_ms: 125,
            http_status: 201,
            outcome: "DELIVERED"
        });
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
                    ...connectorConfiguration("0199037b-6400-7000-8000-000000000206", "ERP_B"),
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
                        "0199037b-6400-7000-8000-000000000207",
                        CONNECTOR_A_ID
                    ),
                    provider_payload_hash: "not-a-sha-256"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values({
                    ...inboundDelivery(
                        "0199037b-6400-7000-8000-000000000208",
                        CONNECTOR_A_ID
                    ),
                    external_event_id: "evt-invalid-lease",
                    lease_owner: "worker-without-token"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values({
                    ...inboundDelivery(
                        "0199037b-6400-7000-8000-000000000209",
                        CONNECTOR_A_ID
                    ),
                    external_event_id: "evt-forwarding-without-lease",
                    status: "FORWARDING"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values({
                    ...inboundDelivery(
                        "0199037b-6400-7000-8000-000000000210",
                        CONNECTOR_A_ID
                    ),
                    external_event_id: "evt-delivered-without-completion",
                    status: "DELIVERED"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
            database
                .insertInto("inbound_deliveries")
                .values({
                    ...inboundDelivery(
                        "0199037b-6400-7000-8000-000000000216",
                        CONNECTOR_A_ID
                    ),
                    external_event_id: "evt-delivered",
                    status: "DELIVERED",
                    completed_at: new Date("2026-08-30T10:00:00.000Z")
                })
                .execute()
        ).resolves.toBeDefined();
    });

    it("maps legacy terminal delivery states", async () => {
        const migrationDatabase = database as unknown as Kysely<unknown>;
        await alignDeliveryLifecycleStates.down(migrationDatabase);
        await database
            .insertInto("inbound_deliveries")
            .values([
                {
                    ...inboundDelivery(
                        "0199037b-6400-7000-8000-000000000217",
                        CONNECTOR_A_ID
                    ),
                    external_event_id: "evt-legacy-succeeded"
                },
                {
                    ...inboundDelivery(
                        "0199037b-6400-7000-8000-000000000218",
                        CONNECTOR_A_ID
                    ),
                    external_event_id: "evt-legacy-auth"
                },
                {
                    ...inboundDelivery(
                        "0199037b-6400-7000-8000-000000000219",
                        CONNECTOR_A_ID
                    ),
                    external_event_id: "evt-legacy-conflict"
                }
            ])
            .execute();
        await sql`
            UPDATE inbound_deliveries
            SET status = CASE external_event_id
                WHEN 'evt-legacy-succeeded' THEN 'SUCCEEDED'
                WHEN 'evt-legacy-auth' THEN 'BLOCKED_AUTH'
                WHEN 'evt-legacy-conflict' THEN 'PAYLOAD_CONFLICT'
                ELSE status
            END
            WHERE external_event_id LIKE 'evt-legacy-%'
        `.execute(database);

        await alignDeliveryLifecycleStates.up(migrationDatabase);

        const migrated = await database
            .selectFrom("inbound_deliveries")
            .select(["external_event_id", "status", "error_code", "completed_at"])
            .where("external_event_id", "like", "evt-legacy-%")
            .orderBy("external_event_id")
            .execute();
        expect(migrated.every(({ completed_at: completedAt }) => completedAt instanceof Date)).toBe(
            true
        );
        expect(
            migrated.map(({ error_code, external_event_id, status }) => ({
                error_code,
                external_event_id,
                status
            }))
        ).toEqual([
            {
                external_event_id: "evt-legacy-auth",
                status: "BLOCKED_CONFIGURATION",
                error_code: "CORE_AUTHENTICATION_REJECTED"
            },
            {
                external_event_id: "evt-legacy-conflict",
                status: "PERMANENT_FAILURE",
                error_code: "PAYLOAD_CONFLICT"
            },
            {
                external_event_id: "evt-legacy-succeeded",
                status: "DELIVERED",
                error_code: null
            }
        ]);
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

function deliveryAttempt(id: string, deliveryId: string, attemptNumber: number) {
    return {
        id,
        delivery_id: deliveryId,
        attempt_number: attemptNumber,
        started_at: new Date("2026-08-30T08:00:00.000Z"),
        completed_at: null,
        outcome: null,
        http_status: null,
        error_code: null,
        safe_error_message: null,
        duration_ms: null,
        trace_id: "a".repeat(32)
    };
}
