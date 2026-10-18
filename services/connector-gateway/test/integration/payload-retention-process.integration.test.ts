import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql, type Insertable, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";
import { createOperatorJwtFixture, type OperatorJwtFixture } from "../support/operator-jwt-fixture.js";

const MARKETPLACE = "0199037b-6400-7000-8000-000000000001";
const DISABLED_CONNECTOR = "0199037b-6400-7000-8000-000000000002";
const PAST = new Date("2000-01-01T00:00:00Z");
const FUTURE = new Date("2100-01-01T00:00:00Z");
const SOURCE_KEY = "src_retention_test.synthetic";

describe("Gateway payload retention process", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let server: Server;
    let serverPort: number;
    let gatewayPort: number;
    let gateway: ChildProcess | undefined;
    let output = "";
    let identity: OperatorJwtFixture;
    let forwarded = 0;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({ connectionString: container.getConnectionUri(), connectionTimeoutMilliseconds: 2_000, maxPoolSize: 4 });
        await migrateToLatest(database);
        await database.updateTable("connector_configurations").set({ status: "DISABLED" })
            .where("id", "=", DISABLED_CONNECTOR).execute();
        identity = await createOperatorJwtFixture({
            audience: "retention-process-test", issuer: "https://identity.example.test",
            keyId: "retention-process-key", subject: "synthetic-retention-admin"
        });
        server = createServer((request, response) => {
            response.setHeader("content-type", "application/json");
            if (request.url === "/jwks") response.end(JSON.stringify(identity.jwks));
            else {
                request.resume();
                forwarded++;
                response.writeHead(201);
                response.end(JSON.stringify({ id: randomUUID() }));
            }
        });
        serverPort = await listen(server);
    });

    afterAll(async () => {
        if (gateway !== undefined && gateway.exitCode === null && gateway.signalCode === null) {
            gateway.kill("SIGTERM");
            await exited(gateway);
        }
        if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
        await database?.destroy();
        await container?.stop();
    });

    it("leaves expired terminal payloads intact when disabled", async () => {
        const row = delivery("DELIVERED");
        await database.insertInto("inbound_deliveries").values(row).execute();
        await start(false, false);
        const metrics = await (await fetch(url("/metrics"))).text();
        expect(metrics).toContain('connector_gateway_payload_retention_batches_total{outcome="completed"} 0');
        expect((await stored(row.id)).raw_payload).toEqual({ synthetic: true });
        await stop();
    });

    it("cleans terminal backlog, forwards expired active work, and preserves authenticated replay idempotency", async () => {
        const queued = delivery("RECEIVED");
        const exhausted = { ...delivery("EXHAUSTED"), payload_expires_at: FUTURE };
        const disabledWork = { ...delivery("RETRY_WAIT"), connector_id: DISABLED_CONNECTOR };
        await database.insertInto("inbound_deliveries").values([queued, exhausted, disabledWork]).execute();
        await start(true, true);
        await waitFor(async () => (await stored(queued.id)).payload_cleared_at !== null);
        expect((await stored(queued.id)).status).toBe("DELIVERED");
        expect(forwarded).toBe(1);
        expect((await stored(disabledWork.id)).raw_payload).toEqual({ synthetic: true });

        const token = await identity.issueToken({ groups: ["platform-admin"] });
        const idempotencyKey = randomUUID();
        const requestReplay = () => fetch(url(`/api/v1/operator/deliveries/${exhausted.id}/replay`), {
            method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
            body: JSON.stringify({ reason: "Synthetic retention process acceptance" })
        });
        expect((await requestReplay()).status).toBe(202);
        await waitFor(async () => (await stored(exhausted.id)).status === "DELIVERED");
        expect(forwarded).toBe(2);
        expect((await stored(exhausted.id)).canonical_payload).not.toBeNull();
        await database.updateTable("inbound_deliveries").set({ payload_expires_at: PAST })
            .where("id", "=", exhausted.id).execute();
        await waitFor(async () => (await stored(exhausted.id)).payload_cleared_at !== null);
        const cleared = await stored(exhausted.id);
        const inspected = await fetch(url(`/api/v1/operator/deliveries/${exhausted.id}`), {
            headers: { authorization: `Bearer ${token}` }
        });
        expect(inspected.status).toBe(200);
        expect(await inspected.json()).toMatchObject({ payloadRetained: false, status: "DELIVERED" });
        const repeated = await requestReplay();
        expect(repeated.status).toBe(202);
        expect(await repeated.json()).toMatchObject({ outcome: "REPLAYED", idempotent: true });
        expect(await stored(exhausted.id)).toEqual(cleared);
        const metrics = await (await fetch(url("/metrics"))).text();
        expect(metrics).toContain("connector_gateway_payload_retention_cleared_deliveries_total 3");
        expect(metrics).not.toContain(token);
        await stop();
        expect(output).not.toContain(token);
        expect(output).not.toContain(SOURCE_KEY);
    });

    it("restarts safely and waits for an active SQL batch on SIGTERM before closing the pool", async () => {
        const existing = await database.selectFrom("inbound_deliveries").selectAll()
            .where("payload_cleared_at", "is not", null).orderBy("id").execute();
        const blocked = delivery("DELIVERED");
        await database.insertInto("inbound_deliveries").values(blocked).execute();
        await sql`CREATE SCHEMA retention_shutdown_test`.execute(database);
        await sql`CREATE FUNCTION retention_shutdown_test.await_release() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN PERFORM pg_advisory_xact_lock(91031, 91032); RETURN NEW; END $$`.execute(database);
        await sql`CREATE TRIGGER retention_shutdown_test BEFORE UPDATE OF payload_cleared_at ON inbound_deliveries
            FOR EACH ROW EXECUTE FUNCTION retention_shutdown_test.await_release()`.execute(database);
        const held = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const holder = database.transaction().execute(async transaction => {
            await sql`SELECT pg_advisory_xact_lock(91031, 91032)`.execute(transaction);
            held.resolve();
            await release.promise;
        });
        await held.promise;
        const later = delivery("DELIVERED");
        try {
            await start(true, false);
            await waitFor(async () => {
                const result = await sql<{ waiting: boolean }>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                    WHERE datname = current_database() AND wait_event = 'advisory' AND query ILIKE '%WITH cutoff%') AS waiting`.execute(database);
                return result.rows[0]!.waiting;
            });
            // This new row was not selected by the already-running batch.
            await database.insertInto("inbound_deliveries").values(later).execute();
            gateway!.kill("SIGTERM");
            await waitFor(() => Promise.resolve(output.includes("Shutting down connector gateway")));
            expect(gateway!.exitCode).toBeNull();
        } finally {
            release.resolve();
            await holder;
        }
        await expect(exited(gateway!)).resolves.toEqual({ code: 0, signal: null });
        expect((await stored(blocked.id)).payload_cleared_at).not.toBeNull();
        expect((await stored(later.id)).payload_cleared_at).toBeNull();
        expect(await database.selectFrom("inbound_deliveries").selectAll().where("id", "in", existing.map(row => row.id)).orderBy("id").execute())
            .toEqual(existing);
    });

    function stored(id: string) {
        return database.selectFrom("inbound_deliveries").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    }
    function url(path: string) { return `http://127.0.0.1:${gatewayPort}${path}`; }

    async function start(retention: boolean, worker: boolean): Promise<void> {
        const reservation = createServer();
        gatewayPort = await listen(reservation);
        await new Promise<void>(resolve => reservation.close(() => resolve()));
        output = "";
        gateway = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
            cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env,
                DATABASE_URL: container.getConnectionUri(), HOST: "127.0.0.1", PORT: String(gatewayPort),
                PAYLOAD_RETENTION_ENABLED: String(retention), PAYLOAD_RETENTION_BATCH_SIZE: "1", PAYLOAD_RETENTION_INTERVAL_MILLISECONDS: "100",
                DELIVERY_WORKER_ENABLED: String(worker), DELIVERY_WORKER_ID: "synthetic-retention-worker",
                DELIVERY_WORKER_INTERVAL_MILLISECONDS: "100", DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS: "2000",
                ERP_B_POLLING_ENABLED: "false", OTEL_SDK_DISABLED: "true",
                INTEGRATION_CORE_BASE_URL: `http://127.0.0.1:${serverPort}`, INTEGRATION_CORE_SOURCE_API_KEY: SOURCE_KEY,
                INTEGRATION_CORE_TIMEOUT_MILLISECONDS: "500",
                MARKETPLACE_A_WEBHOOK_CURRENT_KEY_ID: "synthetic-retention-key", MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64: Buffer.alloc(32).toString("base64"),
                OPERATOR_OIDC_ENABLED: "true", OPERATOR_AUTHORIZATION_ENABLED: "true",
                OPERATOR_OIDC_ISSUER: "https://identity.example.test", OPERATOR_OIDC_AUDIENCE: "retention-process-test",
                OPERATOR_OIDC_JWKS_URL: `http://127.0.0.1:${serverPort}/jwks`
            }
        });
        gateway.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
        gateway.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
        await waitFor(async () => {
            try { return (await fetch(url("/health"))).ok; } catch { return false; }
        });
    }
    async function stop(): Promise<void> {
        gateway!.kill("SIGTERM");
        expect(await exited(gateway!)).toEqual({ code: 0, signal: null });
    }
});

function delivery(status: "DELIVERED" | "EXHAUSTED" | "RECEIVED" | "RETRY_WAIT"): Insertable<GatewayDatabase["inbound_deliveries"]> & { id: string } {
    const id = randomUUID();
    return {
        id, connector_id: MARKETPLACE, external_event_id: `synthetic-${id}`,
        provider_payload_hash: "a".repeat(64), raw_payload: { synthetic: true },
        canonical_payload: { externalId: `synthetic-${id}`, currency: "EUR", declaredTotalAmount: "1.00",
            items: [{ externalLineId: "1", sku: "SYNTHETIC-SKU", quantity: "1", unitPrice: "1.00" }] },
        mapping_version: "synthetic-v1", status, payload_expires_at: PAST, next_attempt_at: PAST,
        completed_at: status === "RECEIVED" || status === "RETRY_WAIT" ? null : PAST,
        lease_owner: null, lease_token: null, lease_expires_at: null, error_code: null, safe_error_message: null,
        last_http_status: null, correlation_id: null, last_core_order_id: null, traceparent: null, tracestate: null,
        replay_link_traceparent: null, replay_link_tracestate: null
    };
}

async function listen(server: Server): Promise<number> {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Expected synthetic HTTP listener");
    return address.port;
}
async function waitFor(operation: () => Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        if (await operation()) return;
        await delay(25);
    }
    throw new Error("Synthetic process condition did not settle");
}
async function exited(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    if (child.exitCode !== null || child.signalCode !== null) return { code: child.exitCode, signal: child.signalCode };
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Gateway shutdown did not settle")), 10_000);
        child.once("exit", (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
    });
}
