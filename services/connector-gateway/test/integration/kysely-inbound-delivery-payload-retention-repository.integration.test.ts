import { randomUUID } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql, type Insertable, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createClearExpiredInboundDeliveryPayloadsUseCase } from "../../src/application/deliveries/clear-expired-inbound-delivery-payloads.js";
import type { ReceiveInboundDeliveryCommand } from "../../src/application/deliveries/receive-inbound-delivery-command.js";
import type { CommitPolledOrderPageCommand } from "../../src/application/polling/commit-polled-order-page.js";
import { createDatabase, type GatewayDatabase, type InboundDeliveryStatus } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryPayloadRetentionRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-payload-retention-repository.js";
import { KyselyInboundDeliveryRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-repository.js";
import { KyselyPolledOrderPageRepository } from "../../src/infrastructure/database/kysely-polled-order-page-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";
import * as retentionIndex from "../../src/infrastructure/database/migrations/011_index_terminal_payload_retention.js";

const MARKETPLACE = "0199037b-6400-7000-8000-000000000001";
const ERP = "0199037b-6400-7000-8000-000000000002";
const PAST = new Date("2000-01-01T00:00:00Z");
const FUTURE = new Date("2100-01-01T00:00:00Z");
const ORDER: ReceiveInboundDeliveryCommand["canonicalOrder"] = {
    externalId: "synthetic-retention-order", currency: "EUR", declaredTotalAmount: "1.00",
    items: [{ externalLineId: "1", sku: "SYNTHETIC-SKU", quantity: "1", unitPrice: "1.00" }]
};
const RECEIPT: ReceiveInboundDeliveryCommand = {
    externalEventId: "synthetic-retention-event", providerPayloadHash: "a".repeat(64),
    providerPayloadJson: JSON.stringify({ synthetic: true }), mappingVersion: "synthetic-v1",
    canonicalOrder: ORDER
};

describe("KyselyInboundDeliveryPayloadRetentionRepository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionString: container.getConnectionUri(),
            connectionTimeoutMilliseconds: 2_000, maxPoolSize: 4
        });
        await migrateToLatest(database);
    });

    beforeEach(async () => {
        await sql`TRUNCATE inbound_deliveries, delivery_attempts, operator_command_audit_entries`.execute(database);
        await database.updateTable("connector_configurations").set({ status: "ACTIVE" }).execute();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it.each(["DELIVERED", "PERMANENT_FAILURE", "BLOCKED_CONFIGURATION", "EXHAUSTED"] as const)(
        "clears expired %s payloads atomically without changing ledger or history", async status => {
            const row = delivery(status);
            await database.insertInto("inbound_deliveries").values(row).execute();
            await database.insertInto("delivery_attempts").values({
                id: randomUUID(), delivery_id: row.id, attempt_number: 1,
                started_at: PAST, completed_at: PAST, outcome: "RETRYABLE_FAILURE",
                error_code: "CORE_REQUEST_TIMEOUT", duration_ms: 0
            }).execute();
            const audit = {
                command_id: randomUUID(), action: "DELIVERY_REPLAY", target_type: "INBOUND_DELIVERY",
                target_id: row.id, actor_subject: "synthetic-retention-operator",
                reason: "Synthetic retention evidence", idempotency_key: randomUUID(), occurred_at: PAST
            };
            await database.insertInto("operator_command_audit_entries").values([
                { ...audit, id: randomUUID(), event_type: "REQUESTED" },
                { ...audit, id: randomUUID(), event_type: "SUCCEEDED" }
            ]).execute();
            const before = await stored(row.id);
            const attempts = await database.selectFrom("delivery_attempts").selectAll().execute();
            const history = await database.selectFrom("operator_command_audit_entries").selectAll().orderBy("id").execute();
            const clockBefore = await sql<{ at: Date }>`SELECT clock_timestamp() AS at`.execute(database);

            expect(await clear()).toBe(1);
            const after = await stored(row.id);
            expect(after.payload_cleared_at).toBeInstanceOf(Date);
            expect(after).toEqual({ ...before, raw_payload: null, canonical_payload: null, payload_cleared_at: after.payload_cleared_at });
            expect(after.payload_cleared_at!.getTime()).toBeGreaterThanOrEqual(clockBefore.rows[0]!.at.getTime());
            expect(await database.selectFrom("delivery_attempts").selectAll().execute()).toEqual(attempts);
            expect(await database.selectFrom("operator_command_audit_entries").selectAll().orderBy("id").execute()).toEqual(history);
            expect(await clear()).toBe(0);
            expect(await stored(row.id)).toEqual(after);
        }
    );

    it.each(["RECEIVED", "RETRY_WAIT", "FORWARDING"] as const)(
        "retains expired %s work even with a disabled connector or expired lease", async status => {
            const row = delivery(status);
            await database.insertInto("inbound_deliveries").values(row).execute();
            await database.updateTable("connector_configurations").set({ status: "DISABLED" }).where("id", "=", MARKETPLACE).execute();
            const before = await stored(row.id);
            expect(await clear()).toBe(0);
            expect(await stored(row.id)).toEqual(before);
        }
    );

    it("keeps unexpired terminal payloads and terminal rows completed after the cutoff", async () => {
        const rows = [
            { ...delivery("DELIVERED"), payload_expires_at: FUTURE },
            { ...delivery("EXHAUSTED"), completed_at: FUTURE }
        ];
        await database.insertInto("inbound_deliveries").values(rows).execute();
        const before = await allStored();
        expect(await clear()).toBe(0);
        expect(await allStored()).toEqual(before);
    });

    it("uses inclusive expiry and completion with one database cutoff at microsecond precision", async () => {
        // Override function resolution only inside this isolated test transaction.
        // The application still supplies no clock; PostgreSQL evaluates the cutoff.
        await database.transaction().execute(async transaction => {
            await sql`CREATE SCHEMA retention_test`.execute(transaction);
            await sql`CREATE FUNCTION retention_test.clock_timestamp() RETURNS timestamptz
                LANGUAGE sql AS $$ SELECT '2000-01-01T00:00:01.123456Z'::timestamptz $$`.execute(transaction);
            await sql`SET LOCAL search_path = retention_test, pg_catalog, public`.execute(transaction);
            const equal = delivery("DELIVERED");
            const laterExpiry = delivery("DELIVERED");
            const laterCompletion = delivery("DELIVERED");
            await transaction.insertInto("inbound_deliveries").values([equal, laterExpiry, laterCompletion]).execute();
            await sql`UPDATE inbound_deliveries
                SET payload_expires_at = clock_timestamp(), completed_at = clock_timestamp()`.execute(transaction);
            await sql`UPDATE inbound_deliveries SET payload_expires_at = payload_expires_at + interval '1 microsecond'
                WHERE id = ${laterExpiry.id}`.execute(transaction);
            await sql`UPDATE inbound_deliveries SET completed_at = completed_at + interval '1 microsecond'
                WHERE id = ${laterCompletion.id}`.execute(transaction);

            expect(await clear(100, transaction)).toBe(1);
            const result = await sql<{ id: string; exactly_equal: boolean }>`
                SELECT id, payload_cleared_at = payload_expires_at AND payload_cleared_at = completed_at AS exactly_equal
                FROM inbound_deliveries WHERE payload_cleared_at IS NOT NULL
            `.execute(transaction);
            expect(result.rows).toEqual([{ id: equal.id, exactly_equal: true }]);
            expect(await clear(100, transaction)).toBe(0);
            await sql`DROP SCHEMA retention_test CASCADE`.execute(transaction);
        });
    });

    it("clears only a bounded batch ordered by expiry then ID, with one shared marker", async () => {
        const rows = [delivery("DELIVERED"), delivery("EXHAUSTED"), { ...delivery("PERMANENT_FAILURE"), payload_expires_at: new Date("2001-01-01T00:00:00Z") }];
        await database.insertInto("inbound_deliveries").values(rows).execute();
        const expected = rows.slice(0, 2).map(row => row.id).sort();
        expect(await clear(1)).toBe(1);
        expect((await allStored()).filter(row => row.payload_cleared_at !== null).map(row => row.id)).toEqual([expected[0]]);
        expect(await clear(2)).toBe(2);
        const markers = await sql<{ count: string }>`SELECT count(DISTINCT payload_cleared_at) AS count
            FROM inbound_deliveries WHERE id <> ${expected[0]}`.execute(database);
        expect(markers.rows).toEqual([{ count: "1" }]);
        expect(await clear()).toBe(0);
    });

    it("clears only raw content for a bounded ERP mapping rejection without changing its outcome", async () => {
        const row = { ...delivery("PERMANENT_FAILURE"), connector_id: ERP, canonical_payload: null, error_code: "ERP_B_UNSUPPORTED_CURRENCY" };
        await database.insertInto("inbound_deliveries").values(row).execute();
        const before = await stored(row.id);
        expect(await clear()).toBe(1);
        const after = await stored(row.id);
        expect(after.payload_cleared_at).toBeInstanceOf(Date);
        expect(after).toEqual({ ...before, raw_payload: null, payload_cleared_at: after.payload_cleared_at });
    });

    it("rolls back the entire batch before commit and can be retried", async () => {
        await database.insertInto("inbound_deliveries").values([delivery("DELIVERED"), delivery("EXHAUSTED")]).execute();
        const before = await allStored();
        const failure = new Error("Synthetic abort before commit");
        await expect(database.transaction().execute(async transaction => {
            expect(await clear(100, transaction)).toBe(2);
            throw failure;
        })).rejects.toBe(failure);
        expect(await allStored()).toEqual(before);
        expect(await clear()).toBe(2);
        expect(await clear()).toBe(0);
    });

    it("returns zero on an empty ledger", async () => {
        expect(await clear()).toBe(0);
    });

    it("keeps webhook duplicate identity and conflicts after clearing without rehydration", async () => {
        const receipts = new KyselyInboundDeliveryRepository(database);
        const created = await receipts.receive(MARKETPLACE, RECEIPT);
        await database.updateTable("inbound_deliveries").set({
            status: "DELIVERED", completed_at: PAST, payload_expires_at: PAST
        }).where("id", "=", created.deliveryId).execute();
        expect(await clear()).toBe(1);
        const cleared = await stored(created.deliveryId);
        expect(await receipts.receive(MARKETPLACE, RECEIPT)).toEqual({ deliveryId: created.deliveryId, outcome: "EQUIVALENT_REPLAY" });
        expect(await receipts.receive(MARKETPLACE, { ...RECEIPT, providerPayloadHash: "b".repeat(64) })).toEqual({ deliveryId: created.deliveryId, outcome: "PAYLOAD_CONFLICT" });
        expect(await allStored()).toEqual([cleared]);
    });

    it.each(["delivery", "rejection"] as const)(
        "keeps polling %s deduplication after clearing and rolls back a conflicting page", async kind => {
            const pages = new KyselyPolledOrderPageRepository(database);
            const leaseToken = randomUUID();
            await database.updateTable("polling_checkpoints").set({
                cursor: null, version: 1, lease_owner: "synthetic-poller", lease_token: leaseToken,
                lease_expires_at: FUTURE, last_polled_at: null, last_successful_poll_at: null
            }).where("connector_id", "=", ERP).execute();
            const rejection = { ...RECEIPT, errorCode: "ERP_B_UNSUPPORTED_CURRENCY" };
            const page: CommitPolledOrderPageCommand = {
                connectorId: ERP, expectedCheckpointVersion: 1, leaseOwner: "synthetic-poller", leaseToken,
                polledAt: PAST, nextCursor: "synthetic-cursor-1",
                deliveries: kind === "delivery" ? [RECEIPT] : [],
                rejectedChanges: kind === "rejection" ? [rejection] : []
            };
            expect(await pages.commitPage(page)).toMatchObject({ outcome: "COMMITTED", checkpointVersion: 2 });
            await database.updateTable("inbound_deliveries").set({
                ...(kind === "delivery" ? { status: "DELIVERED" as const, completed_at: PAST } : {}),
                payload_expires_at: PAST
            }).execute();
            expect(await clear()).toBe(1);
            const cleared = await allStored();
            expect(await pages.commitPage({ ...page, expectedCheckpointVersion: 2, nextCursor: "synthetic-cursor-2" })).toEqual({
                outcome: "COMMITTED", checkpointVersion: 3, createdDeliveries: 0, createdRejections: 0, equivalentReplays: 1
            });
            const checkpoint = await database.selectFrom("polling_checkpoints").selectAll().where("connector_id", "=", ERP).executeTakeFirstOrThrow();
            const conflicting = {
                ...page, expectedCheckpointVersion: 3, nextCursor: "synthetic-cursor-conflict",
                deliveries: [
                    { ...RECEIPT, externalEventId: "synthetic-new-event-before-conflict" },
                    ...(kind === "delivery" ? [{ ...RECEIPT, providerPayloadHash: "b".repeat(64) }] : [])
                ],
                rejectedChanges: kind === "rejection" ? [{ ...rejection, providerPayloadHash: "b".repeat(64) }] : []
            };
            expect(await pages.commitPage(conflicting)).toEqual({ outcome: "PAYLOAD_CONFLICT", externalEventId: RECEIPT.externalEventId });
            expect(await allStored()).toEqual(cleared);
            expect(await database.selectFrom("polling_checkpoints").selectAll().where("connector_id", "=", ERP).executeTakeFirstOrThrow()).toEqual(checkpoint);
        }
    );

    it("uses the partial expiry/ID index for selective candidates and supports index rollback", async () => {
        const row = delivery("RECEIVED");
        await database.insertInto("inbound_deliveries").values(row).execute();
        // A large active ledger with a small terminal backlog, without application
        // payload materialization or planner settings that force index usage.
        await sql`INSERT INTO inbound_deliveries (
            id, connector_id, external_event_id, provider_payload_hash, raw_payload, canonical_payload, mapping_version,
            status, payload_expires_at, completed_at
        ) SELECT gen_random_uuid(), connector_id, 'synthetic-plan-' || n, provider_payload_hash,
            raw_payload, canonical_payload, mapping_version,
            CASE WHEN n <= 20 THEN 'DELIVERED' ELSE 'RECEIVED' END,
            payload_expires_at, CASE WHEN n <= 20 THEN payload_expires_at ELSE NULL END
        FROM inbound_deliveries CROSS JOIN generate_series(1, 10000) AS n WHERE id = ${row.id}`.execute(database);
        await sql`ANALYZE inbound_deliveries`.execute(database);
        const plan = await sql<{ "QUERY PLAN": unknown }>`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
            WITH cutoff AS MATERIALIZED (SELECT clock_timestamp() AS cleared_at)
            SELECT delivery.id FROM inbound_deliveries AS delivery CROSS JOIN cutoff
            WHERE delivery.payload_cleared_at IS NULL
              AND delivery.status IN ('DELIVERED', 'PERMANENT_FAILURE', 'BLOCKED_CONFIGURATION', 'EXHAUSTED')
              AND delivery.payload_expires_at <= cutoff.cleared_at AND delivery.completed_at <= cutoff.cleared_at
            ORDER BY delivery.payload_expires_at, delivery.id LIMIT 10 FOR UPDATE OF delivery SKIP LOCKED
        `.execute(database);
        expect(JSON.stringify(plan.rows)).toContain("ix_inbound_deliveries_payload_retention");
        expect(await clear(10)).toBe(10);
        await retentionIndex.down(database as unknown as Kysely<unknown>);
        try {
            expect(await clear(10)).toBe(10);
        } finally {
            await retentionIndex.up(database as unknown as Kysely<unknown>);
        }
        expect(await clear()).toBe(0);
    });

    function clear(batchSize = 100, connection: Kysely<GatewayDatabase> = database) {
        return createClearExpiredInboundDeliveryPayloadsUseCase({
            batchSize, repository: new KyselyInboundDeliveryPayloadRetentionRepository(connection)
        })();
    }

    function stored(id: string) {
        return database.selectFrom("inbound_deliveries").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    }

    function allStored() {
        return database.selectFrom("inbound_deliveries").selectAll().orderBy("id").execute();
    }
});

function delivery(status: InboundDeliveryStatus): Insertable<GatewayDatabase["inbound_deliveries"]> {
    const active = status === "RECEIVED" || status === "RETRY_WAIT" || status === "FORWARDING";
    return {
        id: randomUUID(), connector_id: MARKETPLACE, external_event_id: `synthetic-${randomUUID()}`,
        provider_payload_hash: "a".repeat(64), raw_payload: { synthetic: true }, canonical_payload: ORDER,
        mapping_version: "synthetic-v1", status, attempt_count: 1,
        payload_expires_at: PAST, completed_at: active ? null : PAST,
        lease_owner: status === "FORWARDING" ? "synthetic-worker" : null,
        lease_token: status === "FORWARDING" ? randomUUID() : null,
        lease_expires_at: status === "FORWARDING" ? PAST : null,
        error_code: null, safe_error_message: null, last_http_status: null,
        correlation_id: randomUUID(), last_core_order_id: randomUUID(),
        traceparent: "00-12345678901234567890123456789012-1234567890123456-01", tracestate: null,
        replay_link_traceparent: null, replay_link_tracestate: null
    };
}
