import { randomUUID } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql, type Insertable, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { KyselyInboundDeliveryClaimRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-claim-repository.js";
import { createDatabase, type GatewayDatabase, type InboundDeliveryStatus } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryPayloadRetentionRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-payload-retention-repository.js";
import { KyselyInboundDeliveryReplayRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-replay-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";
import type { ReplayInboundDeliveryCommand } from "../../src/application/deliveries/replay-inbound-delivery.js";
import type { CanonicalOrder } from "../../src/application/orders/canonical-order.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000001";
const LOCKED_ID = "0199037b-6400-7000-8000-000000000601";
const SECOND_ID = "0199037b-6400-7000-8000-000000000602";
const THIRD_ID = "0199037b-6400-7000-8000-000000000603";
const EXPIRED = new Date("2000-01-01T00:00:00Z");
const ORDER: CanonicalOrder = {
    externalId: "synthetic-concurrency-order", currency: "EUR", declaredTotalAmount: "1.00",
    items: [{ externalLineId: "1", sku: "SYNTHETIC-SKU", quantity: "1", unitPrice: "1.00" }]
};

describe("Gateway payload retention concurrency", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let retention: KyselyInboundDeliveryPayloadRetentionRepository;
    let replay: KyselyInboundDeliveryReplayRepository;
    let claim: KyselyInboundDeliveryClaimRepository;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({ connectionString: container.getConnectionUri(), connectionTimeoutMilliseconds: 2_000, maxPoolSize: 8 });
        await migrateToLatest(database);
        retention = new KyselyInboundDeliveryPayloadRetentionRepository(database);
        replay = new KyselyInboundDeliveryReplayRepository(database);
        claim = new KyselyInboundDeliveryClaimRepository(database);
    });

    beforeEach(async () => {
        await sql`TRUNCATE inbound_deliveries, delivery_attempts, operator_command_audit_entries`.execute(database);
        await database.updateTable("connector_configurations").set({ status: "ACTIVE" }).execute();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("lets two cleanup replicas skip a locked row and clear distinct bounded batches", async () => {
        await database.insertInto("inbound_deliveries").values([
            delivery("DELIVERED", LOCKED_ID), delivery("EXHAUSTED", SECOND_ID), delivery("PERMANENT_FAILURE", THIRD_ID)
        ]).execute();
        const rowLock = deferred();
        const release = deferred();
        const holder = database.transaction().execute(async transaction => {
            await transaction.selectFrom("inbound_deliveries").select("id").where("id", "=", LOCKED_ID)
                .forUpdate().executeTakeFirstOrThrow();
            rowLock.resolve();
            await release.promise;
        });
        await rowLock.promise;

        try {
            const [firstReplica, secondReplica] = await Promise.all([
                retention.clearExpiredTerminalPayloads(1), retention.clearExpiredTerminalPayloads(1)
            ]);
            expect(firstReplica + secondReplica).toBe(2);
            const stored = await database.selectFrom("inbound_deliveries").select(["id", "payload_cleared_at"])
                .orderBy("id").execute();
            expect(stored.map(({ id }) => id)).toEqual([LOCKED_ID, SECOND_ID, THIRD_ID]);
            expect(stored[0]?.payload_cleared_at).toBeNull();
            expect(stored[1]?.payload_cleared_at).toBeInstanceOf(Date);
            expect(stored[2]?.payload_cleared_at).toBeInstanceOf(Date);
        } finally {
            release.resolve();
            await holder;
        }
        expect(await retention.clearExpiredTerminalPayloads(1)).toBe(1);
        expect(await retention.clearExpiredTerminalPayloads(1)).toBe(0);
    });

    it("claims expired queued work before cleanup can select it", async () => {
        const id = randomUUID();
        await database.insertInto("inbound_deliveries").values(delivery("RECEIVED", id)).execute();
        const claimedAt = new Date();
        const claimed = await claim.claimEligible({
            claimedAt, leaseExpiresAt: new Date(claimedAt.getTime() + 30_000),
            leaseToken: randomUUID(), limit: 1, workerId: "synthetic-retention-worker"
        });
        expect(claimed.map(item => item.deliveryId)).toEqual([id]);
        expect(await retention.clearExpiredTerminalPayloads(1)).toBe(0);
        const stored = await database.selectFrom("inbound_deliveries").select(["canonical_payload", "raw_payload", "status"])
            .where("id", "=", id).executeTakeFirstOrThrow();
        expect(stored).toMatchObject({ status: "FORWARDING", raw_payload: { synthetic: true } });
        expect(stored.canonical_payload).toEqual(ORDER);
    });

    it("skips a claim while its status transition holds the delivery row", async () => {
        const id = randomUUID();
        await database.insertInto("inbound_deliveries").values(delivery("RECEIVED", id)).execute();
        await sql`CREATE SCHEMA retention_claim_barrier`.execute(database);
        await sql`CREATE FUNCTION retention_claim_barrier.await_claim_commit() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN
                PERFORM pg_advisory_xact_lock(91021, 91022);
                RETURN NEW;
            END $$`.execute(database);
        await sql`CREATE TRIGGER retention_claim_barrier
            BEFORE UPDATE OF status ON inbound_deliveries
            FOR EACH ROW WHEN (OLD.status IN ('RECEIVED', 'RETRY_WAIT') AND NEW.status = 'FORWARDING')
            EXECUTE FUNCTION retention_claim_barrier.await_claim_commit()`.execute(database);

        const advisoryLockHeld = deferred();
        const releaseAdvisoryLock = deferred();
        const lockOwner = database.transaction().execute(async transaction => {
            await sql`SELECT pg_advisory_xact_lock(91021, 91022)`.execute(transaction);
            advisoryLockHeld.resolve();
            await releaseAdvisoryLock.promise;
        });
        await advisoryLockHeld.promise;
        const claimedAt = new Date();
        const pendingClaim = claim.claimEligible({
            claimedAt, leaseExpiresAt: new Date(claimedAt.getTime() + 30_000),
            leaseToken: randomUUID(), limit: 1, workerId: "synthetic-concurrent-claim"
        });

        try {
            await waitForClaimUpdateBarrier();
            // While the claim has locked the active row, cleanup sees no terminal
            // candidate and does not interfere with the in-flight transition.
            expect(await retention.clearExpiredTerminalPayloads(1)).toBe(0);
        } finally {
            releaseAdvisoryLock.resolve();
            await lockOwner;
            await pendingClaim.catch(() => undefined);
            await sql`DROP TRIGGER IF EXISTS retention_claim_barrier ON inbound_deliveries`.execute(database);
            await sql`DROP SCHEMA IF EXISTS retention_claim_barrier CASCADE`.execute(database);
        }

        expect((await pendingClaim).map(item => item.deliveryId)).toEqual([id]);
        const stored = await database.selectFrom("inbound_deliveries").select(["canonical_payload", "raw_payload", "status"])
            .where("id", "=", id).executeTakeFirstOrThrow();
        expect(stored.status).toBe("FORWARDING");
        expect(stored.raw_payload).toEqual({ synthetic: true });
        expect(stored.canonical_payload).toEqual(ORDER);
    });

    it("waits for cleanup and rejects replay after the payload is cleared", async () => {
        const id = randomUUID();
        await database.insertInto("inbound_deliveries").values(delivery("EXHAUSTED", id)).execute();
        const batchLocked = deferred();
        const releaseBatch = deferred();
        const cleanup = database.transaction().execute(async transaction => {
            expect(await new KyselyInboundDeliveryPayloadRetentionRepository(transaction)
                .clearExpiredTerminalPayloads(1)).toBe(1);
            batchLocked.resolve();
            await releaseBatch.promise;
        });
        await batchLocked.promise;
        const replayRequest = replayCommand(id, new Date(Date.now() - 86_400_000));
        const pendingReplay = replay.replay(replayRequest);
        try {
            await waitForReplayRowLock();
        } finally {
            releaseBatch.resolve();
            await cleanup;
        }

        await expect(pendingReplay).resolves.toMatchObject({
            outcome: "REJECTED", rejectionCode: "DELIVERY_PAYLOAD_EXPIRED"
        });
        const stored = await database.selectFrom("inbound_deliveries").select(["payload_cleared_at", "status"])
            .where("id", "=", id).executeTakeFirstOrThrow();
        expect(stored.payload_cleared_at).toBeInstanceOf(Date);
        expect(stored.status).toBe("EXHAUSTED");
    });

    async function waitForReplayRowLock(): Promise<void> {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
            const result = await sql<{ waiting: boolean }>`SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
                  AND wait_event_type = 'Lock' AND query ILIKE '%for update%'
            ) AS waiting`.execute(database);
            if (result.rows[0]?.waiting === true) return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error("Replay did not reach the PostgreSQL delivery-row lock");
    }

    async function waitForClaimUpdateBarrier(): Promise<void> {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
            const result = await sql<{ waiting: boolean }>`SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
                  AND wait_event = 'advisory' AND query ILIKE 'update "inbound_deliveries"%'
            ) AS waiting`.execute(database);
            if (result.rows[0]?.waiting === true) return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error("Claim did not reach the controlled status-transition barrier");
    }
});

function delivery(status: InboundDeliveryStatus, id: string): Insertable<GatewayDatabase["inbound_deliveries"]> {
    const active = status === "RECEIVED" || status === "RETRY_WAIT" || status === "FORWARDING";
    return {
        id, connector_id: CONNECTOR_ID, external_event_id: `synthetic-${id}`,
        provider_payload_hash: "a".repeat(64), raw_payload: { synthetic: true }, canonical_payload: ORDER,
        mapping_version: "synthetic-retention-v1", status, attempt_count: 1,
        payload_expires_at: EXPIRED, completed_at: active ? null : EXPIRED,
        lease_owner: status === "FORWARDING" ? "synthetic-worker" : null,
        lease_token: status === "FORWARDING" ? randomUUID() : null,
        lease_expires_at: status === "FORWARDING" ? EXPIRED : null,
        error_code: null, safe_error_message: null, last_http_status: null,
        correlation_id: null, last_core_order_id: null, traceparent: null, tracestate: null,
        replay_link_traceparent: null, replay_link_tracestate: null
    };
}

function replayCommand(deliveryId: string, replayedAt: Date): ReplayInboundDeliveryCommand {
    return {
        action: "DELIVERY_REPLAY", actorSubject: "synthetic-retention-operator",
        commandId: randomUUID(), deliveryId, idempotencyKey: randomUUID(),
        reason: "Synthetic cleanup concurrency test", replayedAt
    };
}

function deferred() {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>(complete => { resolve = complete; });
    return { promise, resolve: () => resolve() };
}
