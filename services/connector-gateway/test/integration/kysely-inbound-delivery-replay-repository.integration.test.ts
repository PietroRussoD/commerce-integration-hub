import { randomUUID } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createReplayInboundDeliveryUseCase } from "../../src/application/deliveries/replay-inbound-delivery.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryReplayRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-replay-repository.js";
import { KyselyInboundDeliveryPayloadRetentionRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-payload-retention-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000001";
const EXPIRED_DELIVERY_ID = "0199037b-6400-7000-8000-000000000842";
const REPLAYABLE_DELIVERY_ID = "0199037b-6400-7000-8000-000000000841";
const REPLAYED_AT = new Date("2026-09-12T10:00:00.000Z");
const PREVIOUS_ATTEMPT_CONTEXT = {
    traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
    tracestate: "vendor=previous"
};
const REPLAY_REQUEST_CONTEXT = {
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    tracestate: "vendor=replay"
};

describe("Kysely inbound delivery replay repository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 4
        });
        await migrateToLatest(database);
        const currentTime = await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(database);
        const replayableExpiry = new Date(currentTime.rows[0]!.now.getTime() + 86_400_000);
        const expiredAt = new Date(currentTime.rows[0]!.now.getTime() - 86_400_000);
        await database
            .insertInto("inbound_deliveries")
            .values([
                delivery(REPLAYABLE_DELIVERY_ID, "operator-replayable", replayableExpiry.toISOString()),
                delivery(EXPIRED_DELIVERY_ID, "operator-expired", expiredAt.toISOString())
            ])
            .execute();
        await database
            .insertInto("delivery_attempts")
            .values({
                id: "0199037b-6400-7000-8000-000000000871",
                delivery_id: REPLAYABLE_DELIVERY_ID,
                attempt_number: 5,
                started_at: new Date("2026-09-11T10:01:00.000Z"),
                completed_at: new Date("2026-09-11T10:05:00.000Z"),
                outcome: "RETRYABLE_FAILURE",
                http_status: 503,
                error_code: "CORE_UNAVAILABLE",
                safe_error_message: "Core was temporarily unavailable",
                duration_ms: 100,
                trace_id: "1".repeat(32),
                traceparent: PREVIOUS_ATTEMPT_CONTEXT.traceparent,
                tracestate: PREVIOUS_ATTEMPT_CONTEXT.tracestate
            })
            .execute();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("replays only durable exhausted deliveries and journals the exact outcome", async () => {
        const commandIds = [
            "0199037b-6400-7000-8000-000000000851",
            "0199037b-6400-7000-8000-000000000852",
            "0199037b-6400-7000-8000-000000000853",
            "0199037b-6400-7000-8000-000000000854"
        ];
        const replay = createReplayInboundDeliveryUseCase({
            createCommandId: () => commandIds.shift()!,
            currentTimeMilliseconds: () => REPLAYED_AT.getTime(),
            repository: new KyselyInboundDeliveryReplayRepository(database)
        });
        const replayableRequest = {
            actorSubject: "operator-44",
            deliveryId: REPLAYABLE_DELIVERY_ID,
            idempotencyKey: "0199037b-6400-7000-8000-000000000861",
            reason: "Retry after the upstream incident was resolved",
            traceContext: REPLAY_REQUEST_CONTEXT
        };

        await expect(replay(replayableRequest)).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000851",
            outcome: "REPLAYED"
        });
        await expect(replay(replayableRequest)).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000851",
            idempotent: true,
            outcome: "REPLAYED"
        });
        await expect(
            replay({ ...replayableRequest, reason: "Different operator intent" })
        ).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000851",
            outcome: "IDEMPOTENCY_CONFLICT"
        });
        await expect(
            replay({
                ...replayableRequest,
                deliveryId: EXPIRED_DELIVERY_ID,
                idempotencyKey: "0199037b-6400-7000-8000-000000000862"
            })
        ).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000854",
            outcome: "REJECTED",
            rejectionCode: "DELIVERY_PAYLOAD_EXPIRED"
        });

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select([
                    "attempt_count",
                    "completed_at",
                    "error_code",
                    "next_attempt_at",
                    "status",
                    "replay_link_traceparent",
                    "replay_link_tracestate",
                    "traceparent",
                    "tracestate"
                ])
                .where("id", "=", REPLAYABLE_DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            attempt_count: 5,
            completed_at: null,
            error_code: null,
            next_attempt_at: REPLAYED_AT,
            status: "RECEIVED",
            replay_link_traceparent: PREVIOUS_ATTEMPT_CONTEXT.traceparent,
            replay_link_tracestate: PREVIOUS_ATTEMPT_CONTEXT.tracestate,
            traceparent: REPLAY_REQUEST_CONTEXT.traceparent,
            tracestate: REPLAY_REQUEST_CONTEXT.tracestate
        });
        const auditEntries = await database
            .selectFrom("operator_command_audit_entries")
            .select(["command_id", "error_code", "event_type"])
            .orderBy("command_id", "asc")
            .orderBy("event_type", "asc")
            .execute();
        expect(auditEntries).toEqual([
            {
                command_id: "0199037b-6400-7000-8000-000000000851",
                error_code: null,
                event_type: "REQUESTED"
            },
            {
                command_id: "0199037b-6400-7000-8000-000000000851",
                error_code: null,
                event_type: "SUCCEEDED"
            },
            {
                command_id: "0199037b-6400-7000-8000-000000000854",
                error_code: "DELIVERY_PAYLOAD_EXPIRED",
                event_type: "REJECTED"
            },
            {
                command_id: "0199037b-6400-7000-8000-000000000854",
                error_code: null,
                event_type: "REQUESTED"
            }
        ]);
    });

    it("rejects a replay that obtains its delivery lock after payload expiry", async () => {
        const deliveryId = randomUUID();
        const row = delivery(deliveryId, "synthetic-replay-wait", "2100-01-01T00:00:00.000Z");
        await database.insertInto("inbound_deliveries").values(row).execute();
        const expiry = await sql<{ expires_at: Date }>`UPDATE inbound_deliveries
            SET payload_expires_at = clock_timestamp() + interval '1 second'
            WHERE id = ${deliveryId} RETURNING payload_expires_at AS expires_at`.execute(database);

        let releaseDeliveryLock: () => void = () => undefined;
        const deliveryLockReleased = new Promise<void>(resolve => {
            releaseDeliveryLock = resolve;
        });
        let signalDeliveryLockAcquired: () => void = () => undefined;
        const deliveryLockAcquired = new Promise<void>(resolve => {
            signalDeliveryLockAcquired = resolve;
        });
        const lockOwner = database.transaction().execute(async transaction => {
            await transaction.selectFrom("inbound_deliveries").select("id")
                .where("id", "=", deliveryId).forUpdate().executeTakeFirstOrThrow();
            signalDeliveryLockAcquired();
            await deliveryLockReleased;
        });

        await deliveryLockAcquired;
        const replay = new KyselyInboundDeliveryReplayRepository(database).replay({
            action: "DELIVERY_REPLAY", actorSubject: "synthetic-retention-operator",
            commandId: randomUUID(), deliveryId, idempotencyKey: randomUUID(),
            reason: "Synthetic lock boundary test", replayedAt: new Date(Date.now() - 86_400_000)
        });
        try {
            await waitForPostgresReplayLockWait();
            await waitForDatabaseTime(expiry.rows[0]!.expires_at);
        } finally {
            releaseDeliveryLock();
            await lockOwner;
        }

        await expect(replay).resolves.toMatchObject({
            outcome: "REJECTED", rejectionCode: "DELIVERY_PAYLOAD_EXPIRED"
        });
        const stored = await database.selectFrom("inbound_deliveries").select(["canonical_payload", "status"])
            .where("id", "=", deliveryId).executeTakeFirstOrThrow();
        expect(stored.canonical_payload).not.toBeNull();
        expect(stored.status).toBe("EXHAUSTED");
    });

    it("retains a replay accepted before expiry while it commits after expiry", async () => {
        const deliveryId = randomUUID();
        await database.insertInto("inbound_deliveries").values(
            delivery(deliveryId, "synthetic-replay-crosses-expiry", "2100-01-01T00:00:00Z")
        ).execute();
        const expires = await sql<{ at: Date }>`UPDATE inbound_deliveries
            SET payload_expires_at = clock_timestamp() + interval '3 seconds'
            WHERE id = ${deliveryId} RETURNING payload_expires_at AS at`.execute(database);
        await database.updateTable("inbound_deliveries")
            .set({ payload_expires_at: new Date("2100-01-01T00:00:00Z") })
            .where("id", "!=", deliveryId).execute();
        await sql`CREATE SCHEMA retention_replay_barrier`.execute(database);
        await sql`CREATE FUNCTION retention_replay_barrier.await_commit() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN
                PERFORM pg_advisory_xact_lock(91011, 91012);
                RETURN NEW;
            END $$`.execute(database);
        await sql`CREATE TRIGGER retention_replay_barrier
            BEFORE UPDATE OF status ON inbound_deliveries
            FOR EACH ROW WHEN (OLD.status = 'EXHAUSTED' AND NEW.status = 'RECEIVED')
            EXECUTE FUNCTION retention_replay_barrier.await_commit()`.execute(database);

        const advisoryLockHeld = deferred();
        const releaseAdvisoryLock = deferred();
        const lockOwner = database.transaction().execute(async transaction => {
            await sql`SELECT pg_advisory_xact_lock(91011, 91012)`.execute(transaction);
            advisoryLockHeld.resolve();
            await releaseAdvisoryLock.promise;
        });
        await advisoryLockHeld.promise;
        const pendingReplay = new KyselyInboundDeliveryReplayRepository(database).replay({
            action: "DELIVERY_REPLAY", actorSubject: "synthetic-retention-operator",
            commandId: randomUUID(), deliveryId, idempotencyKey: randomUUID(),
            reason: "Synthetic expiry-crossing test", replayedAt: new Date()
        });

        try {
            const updateQueryStartedAt = await waitForPostgresAdvisoryWait();
            expect(updateQueryStartedAt.getTime()).toBeLessThan(expires.rows[0]!.at.getTime());
            await waitForDatabaseTime(expires.rows[0]!.at);
            // The replay owns the delivery row while its update is held in the
            // trigger. Cleanup must skip it and leave the accepted work intact.
            expect(await new KyselyInboundDeliveryPayloadRetentionRepository(database)
                .clearExpiredTerminalPayloads(100)).toBe(0);
        } finally {
            releaseAdvisoryLock.resolve();
            await lockOwner;
            await pendingReplay.catch(() => undefined);
            await sql`DROP TRIGGER IF EXISTS retention_replay_barrier ON inbound_deliveries`.execute(database);
            await sql`DROP SCHEMA IF EXISTS retention_replay_barrier CASCADE`.execute(database);
        }

        await expect(pendingReplay).resolves.toMatchObject({ outcome: "REPLAYED" });
        const stored = await database.selectFrom("inbound_deliveries")
            .select(["canonical_payload", "payload_cleared_at", "raw_payload", "status"])
            .where("id", "=", deliveryId).executeTakeFirstOrThrow();
        expect(stored.status).toBe("RECEIVED");
        expect(stored.payload_cleared_at).toBeNull();
        expect(stored.raw_payload).toEqual({ privateProviderField: "not-for-operators" });
        expect(stored.canonical_payload).not.toBeNull();
    });

    async function waitForPostgresReplayLockWait(): Promise<void> {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
            const waiting = await sql<{ waiting: boolean }>`SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock'
                  AND query ILIKE '%for update%'
            ) AS waiting`.execute(database);
            if (waiting.rows[0]?.waiting === true) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error("Replay did not reach the PostgreSQL delivery-row lock");
    }

    async function waitForDatabaseTime(expiration: Date): Promise<void> {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
            const expired = await sql<{ expired: boolean }>`SELECT clock_timestamp() >= ${expiration} AS expired`.execute(database);
            if (expired.rows[0]?.expired === true) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error("The database clock did not reach the replay expiry boundary");
    }

    async function waitForPostgresAdvisoryWait(): Promise<Date> {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
            const waiting = await sql<{ query_start: Date }>`SELECT query_start
                FROM pg_stat_activity WHERE datname = current_database()
                  AND wait_event = 'advisory' AND query ILIKE 'update "inbound_deliveries"%'
                LIMIT 1`.execute(database);
            if (waiting.rows[0] !== undefined) return waiting.rows[0].query_start;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error("Replay did not reach the controlled pre-commit barrier");
    }

    function deferred() {
        let resolve: () => void = () => undefined;
        const promise = new Promise<void>(complete => { resolve = complete; });
        return { promise, resolve: () => resolve() };
    }
});

function delivery(id: string, externalEventId: string, payloadExpiresAt: string) {
    return {
        attempt_count: 5,
        canonical_payload: {
            currency: "EUR" as const,
            declaredTotalAmount: "39.98",
            externalId: `MA-${externalEventId}`,
            items: [
                {
                    externalLineId: "1",
                    quantity: "2",
                    sku: "SKU-BOOK-1",
                    unitPrice: "19.99"
                }
            ]
        },
        completed_at: new Date("2026-09-11T10:05:00.000Z"),
        connector_id: CONNECTOR_ID,
        correlation_id: "0199037b-6400-7000-8000-000000000890",
        error_code: "CORE_UNAVAILABLE",
        external_event_id: externalEventId,
        id,
        last_core_order_id: null,
        last_http_status: 503,
        lease_expires_at: null,
        lease_owner: null,
        lease_token: null,
        mapping_version: "marketplace_a-order-v1",
        next_attempt_at: new Date("2026-09-11T10:05:00.000Z"),
        payload_expires_at: new Date(payloadExpiresAt),
        provider_payload_hash: "a".repeat(64),
        raw_payload: { privateProviderField: "not-for-operators" },
        received_at: new Date("2026-09-11T10:00:00.000Z"),
        safe_error_message: "Core was temporarily unavailable",
        status: "EXHAUSTED" as const,
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
        tracestate: "vendor=value",
        updated_at: new Date("2026-09-11T10:05:00.000Z")
    };
}
