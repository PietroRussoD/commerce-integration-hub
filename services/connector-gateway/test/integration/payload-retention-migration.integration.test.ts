import { randomUUID } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql, type Insertable, type Kysely, type Updateable } from "kysely";
import { Migrator } from "kysely/migration";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type GatewayDatabase, type InboundDeliveryStatus } from "../../src/infrastructure/database/database.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";
import * as ledger from "../../src/infrastructure/database/migrations/001_create_delivery_ledger.js";
import * as marketplace from "../../src/infrastructure/database/migrations/002_seed_marketplace_a_connector.js";
import * as leases from "../../src/infrastructure/database/migrations/003_add_delivery_lease_token.js";
import * as attempts from "../../src/infrastructure/database/migrations/004_create_delivery_attempts.js";
import * as lifecycle from "../../src/infrastructure/database/migrations/005_align_delivery_lifecycle_states.js";
import * as polling from "../../src/infrastructure/database/migrations/006_add_erp_b_polling_storage.js";
import * as audit from "../../src/infrastructure/database/migrations/007_create_operator_command_audit.js";
import * as tracing from "../../src/infrastructure/database/migrations/008_add_delivery_trace_context.js";
import * as replayLinks from "../../src/infrastructure/database/migrations/009_add_replay_trace_links.js";
import * as retention from "../../src/infrastructure/database/migrations/010_allow_terminal_payload_clearance.js";

const EXPIRES_AT = new Date("2026-09-01T10:00:00Z");
const COMPLETED_AT = new Date("2026-09-02T10:00:00Z");
const CLEARED_AT = new Date("2026-09-03T10:00:00Z");
const ERP_B_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const MAPPING_ERRORS = [
    "ERP_B_DUPLICATE_POSITION_ID",
    "ERP_B_INVALID_IDENTIFIER",
    "ERP_B_NON_POSITIVE_QUANTITY",
    "ERP_B_TOTAL_MISMATCH",
    "ERP_B_UNSUPPORTED_CURRENCY"
] as const;

describe("Gateway payload retention schema", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionString: container.getConnectionUri(),
            connectionTimeoutMilliseconds: 2_000,
            maxPoolSize: 2
        });
        // Freeze the actual pre-retention migration history, then exercise the
        // production migrator against a populated database in the first test.
        const baseline = new Migrator({
            db: database,
            provider: { getMigrations: () => Promise.resolve({
                "001_create_delivery_ledger": ledger,
                "002_seed_marketplace_a_connector": marketplace,
                "003_add_delivery_lease_token": leases,
                "004_create_delivery_attempts": attempts,
                "005_align_delivery_lifecycle_states": lifecycle,
                "006_add_erp_b_polling_storage": polling,
                "007_create_operator_command_audit": audit,
                "008_add_delivery_trace_context": tracing,
                "009_add_replay_trace_links": replayLinks
            }) }
        });
        const result = await baseline.migrateToLatest();
        if (result.error !== undefined) {
            throw new Error("Failed to prepare the migration 009 baseline", { cause: result.error });
        }
    });

    afterEach(async () => {
        await sql`TRUNCATE inbound_deliveries, delivery_attempts, operator_command_audit_entries`.execute(database);
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("upgrades migration 009 without clearing existing work, attempts, or audit", async () => {
        const exhausted = delivery("EXHAUSTED");
        await database.insertInto("inbound_deliveries").values([
            delivery("RECEIVED"), exhausted,
            { ...delivery("PERMANENT_FAILURE"), connector_id: ERP_B_CONNECTOR_ID, canonical_payload: null, error_code: MAPPING_ERRORS[0] }
        ]).execute();
        await database.insertInto("delivery_attempts").values({
            id: randomUUID(), delivery_id: exhausted.id, attempt_number: 1,
            started_at: EXPIRES_AT, completed_at: COMPLETED_AT,
            outcome: "RETRYABLE_FAILURE", error_code: "CORE_REQUEST_TIMEOUT", duration_ms: 0
        }).execute();
        const request = {
            command_id: randomUUID(), action: "DELIVERY_REPLAY", target_type: "INBOUND_DELIVERY",
            target_id: exhausted.id, actor_subject: "synthetic-retention-operator",
            reason: "Synthetic schema upgrade evidence", idempotency_key: randomUUID(),
            error_code: null, occurred_at: COMPLETED_AT
        };
        await database.insertInto("operator_command_audit_entries").values([
            { ...request, id: randomUUID(), event_type: "REQUESTED" },
            { ...request, id: randomUUID(), event_type: "SUCCEEDED" }
        ]).execute();
        const before = await database.selectFrom("inbound_deliveries").selectAll().orderBy("id").execute();
        const beforeAttempts = await database.selectFrom("delivery_attempts").selectAll().execute();
        const beforeAudit = await database.selectFrom("operator_command_audit_entries").selectAll().orderBy("id").execute();
        const beforeConnectors = await database.selectFrom("connector_configurations").selectAll().orderBy("id").execute();

        expect(await migrateToLatest(database)).toEqual([
            { migrationName: "010_allow_terminal_payload_clearance", direction: "Up", status: "Success" }
        ]);
        expect(await migrateToLatest(database)).toEqual([]);
        const after = await database.selectFrom("inbound_deliveries").selectAll().orderBy("id").execute();
        expect(after.map(({ payload_cleared_at: marker, ...row }) => {
            expect(marker).toBeNull();
            return row;
        })).toEqual(before);
        expect(await database.selectFrom("delivery_attempts").selectAll().execute()).toEqual(beforeAttempts);
        expect(await database.selectFrom("operator_command_audit_entries").selectAll().orderBy("id").execute()).toEqual(beforeAudit);
        expect(await database.selectFrom("connector_configurations").selectAll().orderBy("id").execute()).toEqual(beforeConnectors);
    });

    it.each(["RECEIVED", "RETRY_WAIT", "FORWARDING"] as const)("keeps expired %s payloads mandatory", async status => {
        const row = delivery(status);
        await database.insertInto("inbound_deliveries").values(row).execute();
        await expect(database.updateTable("inbound_deliveries").set({
            raw_payload: null, canonical_payload: null, payload_cleared_at: CLEARED_AT
        }).where("id", "=", row.id).execute()).rejects.toMatchObject({ code: "23514" });
        await expect(database.updateTable("inbound_deliveries").set({
            canonical_payload: null, error_code: MAPPING_ERRORS[0]
        }).where("id", "=", row.id).execute()).rejects.toMatchObject({ code: "23514" });
        expect(await database.selectFrom("inbound_deliveries").select(["raw_payload", "canonical_payload", "payload_cleared_at"]).where("id", "=", row.id).executeTakeFirstOrThrow()).toEqual({
            raw_payload: row.raw_payload, canonical_payload: row.canonical_payload, payload_cleared_at: null
        });
    });

    it.each(["DELIVERED", "PERMANENT_FAILURE", "BLOCKED_CONFIGURATION", "EXHAUSTED"] as const)("represents cleared terminal %s payloads without changing identity or outcome", async status => {
        const row = delivery(status);
        await database.insertInto("inbound_deliveries").values(row).execute();
        await database.updateTable("inbound_deliveries").set({
            raw_payload: null, canonical_payload: null, payload_cleared_at: CLEARED_AT
        }).where("id", "=", row.id).execute();
        expect(await database.selectFrom("inbound_deliveries").selectAll().where("id", "=", row.id).executeTakeFirstOrThrow()).toMatchObject({
            ...row, raw_payload: null, canonical_payload: null, payload_cleared_at: CLEARED_AT
        });
        // A cleared row cannot be dispatched again by changing its status alone.
        await expect(database.updateTable("inbound_deliveries").set({
            status: "RECEIVED", completed_at: null
        }).where("id", "=", row.id).execute()).rejects.toMatchObject({ code: "23514" });
    });

    it.each(MAPPING_ERRORS)("preserves the pre-existing SQL-null canonical exception for %s", async errorCode => {
        const row = { ...delivery("PERMANENT_FAILURE"), connector_id: ERP_B_CONNECTOR_ID, canonical_payload: null, error_code: errorCode };
        await database.insertInto("inbound_deliveries").values(row).execute();
        expect(await database.selectFrom("inbound_deliveries").select("payload_cleared_at").where("id", "=", row.id).executeTakeFirstOrThrow()).toEqual({ payload_cleared_at: null });
        await expect(sql`
            UPDATE inbound_deliveries SET canonical_payload = 'null'::jsonb WHERE id = ${row.id}
        `.execute(database)).rejects.toMatchObject({ code: "23514" });
        await database.updateTable("inbound_deliveries").set({
            raw_payload: null, payload_cleared_at: CLEARED_AT
        }).where("id", "=", row.id).execute();
        await expect(database.updateTable("inbound_deliveries").set({
            payload_cleared_at: null
        }).where("id", "=", row.id).execute()).rejects.toMatchObject({ code: "23514" });
    });

    it("rejects unbounded mapping errors without a canonical payload", async () => {
        await expect(database.insertInto("inbound_deliveries").values({
            ...delivery("PERMANENT_FAILURE"), connector_id: ERP_B_CONNECTOR_ID, canonical_payload: null, error_code: "UNBOUNDED_PROVIDER_ERROR"
        }).execute()).rejects.toMatchObject({ code: "23514" });
    });

    const invalidClearances = [
        { name: "missing raw without marker", changes: { raw_payload: null } },
        { name: "missing canonical without mapping failure", changes: { canonical_payload: null } },
        { name: "both absent without marker", changes: { raw_payload: null, canonical_payload: null } },
        { name: "marker without clearing either payload", changes: { payload_cleared_at: CLEARED_AT } },
        { name: "marker with raw retained", changes: { canonical_payload: null, payload_cleared_at: CLEARED_AT } },
        { name: "marker with canonical retained", changes: { raw_payload: null, payload_cleared_at: CLEARED_AT } },
        { name: "clearance before expiry", changes: { raw_payload: null, canonical_payload: null, payload_cleared_at: new Date(EXPIRES_AT.getTime() - 1) } },
        { name: "clearance before completion", changes: { raw_payload: null, canonical_payload: null, payload_cleared_at: EXPIRES_AT } }
    ] satisfies { name: string; changes: Updateable<GatewayDatabase["inbound_deliveries"]> }[];

    it.each(invalidClearances)("rejects $name", async ({ changes }) => {
        const row = delivery("EXHAUSTED");
        await database.insertInto("inbound_deliveries").values(row).execute();
        await expect(database.updateTable("inbound_deliveries").set(changes).where("id", "=", row.id).execute()).rejects.toMatchObject({ code: "23514" });
    });

    it.each(["raw_payload", "canonical_payload"].flatMap(column => ["null", "[]", '"synthetic"'].map(json => ({ column, json }))))("rejects JSON $json in retained $column", async ({ column, json }) => {
        const row = delivery("EXHAUSTED");
        await database.insertInto("inbound_deliveries").values(row).execute();
        await expect(sql`UPDATE inbound_deliveries SET ${sql.ref(column)} = ${json}::jsonb WHERE id = ${row.id}`.execute(database)).rejects.toMatchObject({ code: "23514" });
    });

    it("allows clearance exactly at expiry and completion", async () => {
        const row = { ...delivery("EXHAUSTED"), completed_at: EXPIRES_AT };
        await database.insertInto("inbound_deliveries").values(row).execute();
        await expect(database.updateTable("inbound_deliveries").set({
            raw_payload: null, canonical_payload: null, payload_cleared_at: EXPIRES_AT
        }).where("id", "=", row.id).execute()).resolves.toBeDefined();
    });

    it("rolls back before any clearance while preserving the mapping exception", async () => {
        const row = { ...delivery("PERMANENT_FAILURE"), connector_id: ERP_B_CONNECTOR_ID, canonical_payload: null, error_code: MAPPING_ERRORS[0] };
        await database.insertInto("inbound_deliveries").values(row).execute();
        await database.transaction().execute(transaction => retention.down(transaction as unknown as Kysely<unknown>));
        try {
            const columns = await sql<{ column_name: string; is_nullable: string }>`
                SELECT column_name, is_nullable FROM information_schema.columns
                WHERE table_name='inbound_deliveries' AND table_schema='public'
                AND column_name IN ('raw_payload','payload_cleared_at')
            `.execute(database);
            expect(columns.rows).toEqual([{ column_name: "raw_payload", is_nullable: "NO" }]);
            expect(await database.selectFrom("inbound_deliveries").select("canonical_payload").where("id", "=", row.id).executeTakeFirstOrThrow()).toEqual({ canonical_payload: null });
        } finally {
            await database.transaction().execute(transaction => retention.up(transaction as unknown as Kysely<unknown>));
        }
    });

    it("refuses rollback atomically after clearance instead of inventing payloads", async () => {
        const row = delivery("EXHAUSTED");
        await database.insertInto("inbound_deliveries").values(row).execute();
        await database.updateTable("inbound_deliveries").set({
            raw_payload: null, canonical_payload: null, payload_cleared_at: CLEARED_AT
        }).where("id", "=", row.id).execute();
        await expect(database.transaction().execute(transaction => retention.down(transaction as unknown as Kysely<unknown>))).rejects.toMatchObject({ code: "23502" });
        expect(await database.selectFrom("inbound_deliveries").select(["raw_payload", "canonical_payload", "payload_cleared_at"]).where("id", "=", row.id).executeTakeFirstOrThrow()).toEqual({ raw_payload: null, canonical_payload: null, payload_cleared_at: CLEARED_AT });
        const constraint = await sql<{ count: string }>`SELECT count(*) FROM pg_constraint WHERE conrelid='inbound_deliveries'::regclass AND conname='ck_inbound_deliveries_payload_retention'`.execute(database);
        expect(constraint.rows).toEqual([{ count: "1" }]);
    });
});

function delivery(status: InboundDeliveryStatus): Insertable<GatewayDatabase["inbound_deliveries"]> {
    const active = status === "RECEIVED" || status === "RETRY_WAIT" || status === "FORWARDING";
    return {
        id: randomUUID(), connector_id: "0199037b-6400-7000-8000-000000000001",
        external_event_id: `synthetic-retention-${randomUUID()}`,
        provider_payload_hash: "a".repeat(64), raw_payload: { synthetic: true },
        canonical_payload: {
            externalId: "synthetic-retention-order", currency: "EUR", declaredTotalAmount: "1.00",
            items: [{ externalLineId: "1", sku: "SYNTHETIC-SKU", quantity: "1", unitPrice: "1.00" }]
        },
        mapping_version: "synthetic-retention-v1", status, attempt_count: 1,
        received_at: new Date("2026-08-01T10:00:00Z"), payload_expires_at: EXPIRES_AT,
        completed_at: active ? null : COMPLETED_AT,
        lease_owner: status === "FORWARDING" ? "synthetic-worker" : null,
        lease_token: status === "FORWARDING" ? randomUUID() : null,
        lease_expires_at: status === "FORWARDING" ? CLEARED_AT : null
    };
}
