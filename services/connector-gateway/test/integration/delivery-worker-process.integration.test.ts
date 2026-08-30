import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { text } from "node:stream/consumers";
import { setTimeout as delay } from "node:timers/promises";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CORE_ORDER_ID = "0199037b-6400-7000-8000-000000000799";
const CORE_SOURCE_API_KEY = "src_process_test.secret";
const WEBHOOK_KEY_ID = "process-test-key";
const WEBHOOK_SECRET = Buffer.alloc(32);
const WEBHOOK_SECRET_BASE64 = WEBHOOK_SECRET.toString("base64");
const WEBHOOK_PAYLOAD = JSON.stringify({
    eventId: "evt-worker-process-test",
    eventType: "order.created",
    order: {
        orderNumber: "MA-WORKER-PROCESS",
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

interface CapturedCoreRequest {
    readonly body: string;
    readonly method: string | undefined;
    readonly sourceApiKey: string | undefined;
    readonly url: string | undefined;
}

describe("Connector Gateway delivery worker process", () => {
    let container: StartedPostgreSqlContainer;
    let coreServer: Server;
    let database: Kysely<GatewayDatabase>;
    let gatewayProcess: ChildProcess | undefined;
    let gatewayOutput = "";
    let gatewayPort: number;
    let corePort: number;
    const coreRequests: CapturedCoreRequest[] = [];

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 4
        });
        await migrateToLatest(database);

        coreServer = createServer((request, response) => {
            void captureCoreRequest(request, response, coreRequests);
        });
        corePort = await listenOnRandomPort(coreServer);
        gatewayPort = await reserveRandomPort();

        gatewayProcess = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                DATABASE_URL: container.getConnectionUri(),
                DELIVERY_WORKER_ENABLED: "true",
                DELIVERY_WORKER_ID: "process-test-worker",
                DELIVERY_WORKER_INTERVAL_MILLISECONDS: "100",
                DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS: "2000",
                HOST: "127.0.0.1",
                INTEGRATION_CORE_BASE_URL: `http://127.0.0.1:${corePort}`,
                INTEGRATION_CORE_SOURCE_API_KEY: CORE_SOURCE_API_KEY,
                INTEGRATION_CORE_TIMEOUT_MILLISECONDS: "500",
                MARKETPLACE_A_WEBHOOK_CURRENT_KEY_ID: WEBHOOK_KEY_ID,
                MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64: WEBHOOK_SECRET_BASE64,
                PORT: gatewayPort.toString()
            },
            stdio: ["ignore", "pipe", "pipe"]
        });
        gatewayProcess.stdout?.on("data", (chunk: Buffer) => {
            gatewayOutput += chunk.toString("utf8");
        });
        gatewayProcess.stderr?.on("data", (chunk: Buffer) => {
            gatewayOutput += chunk.toString("utf8");
        });

        await waitFor(async () => {
            try {
                return (await fetch(`http://127.0.0.1:${gatewayPort}/health`)).ok;
            } catch {
                return false;
            }
        });
    });

    afterAll(async () => {
        if (gatewayProcess !== undefined && gatewayProcess.exitCode === null) {
            gatewayProcess.kill("SIGTERM");
            await waitForProcessExit(gatewayProcess);
        }
        await closeServer(coreServer);
        await database?.destroy();
        await container?.stop();
    });

    it("forwards a signed durable receipt and shuts down cleanly", async () => {
        const readinessResponse = await fetch(
            `http://127.0.0.1:${gatewayPort}/health/ready`
        );
        expect(readinessResponse.status).toBe(200);
        await expect(readinessResponse.json()).resolves.toEqual({
            checks: { database: "UP" },
            status: "UP"
        });

        const timestamp = Math.floor(Date.now() / 1_000).toString();
        const signature = createHmac("sha256", WEBHOOK_SECRET)
            .update(timestamp)
            .update(".")
            .update(WEBHOOK_PAYLOAD)
            .digest("hex");

        const response = await fetch(
            `http://127.0.0.1:${gatewayPort}/providers/marketplace-a/v1/order-webhooks`,
            {
                body: WEBHOOK_PAYLOAD,
                headers: {
                    "content-type": "application/json",
                    "x-webhook-key-id": WEBHOOK_KEY_ID,
                    "x-webhook-signature": `v1=${signature}`,
                    "x-webhook-timestamp": timestamp
                },
                method: "POST"
            }
        );
        const accepted = (await response.json()) as { readonly deliveryId: string };
        expect(response.status).toBe(202);

        const persisted = await waitFor(async () => {
            const delivery = await database
                .selectFrom("inbound_deliveries")
                .leftJoin("delivery_attempts", "delivery_attempts.delivery_id", "inbound_deliveries.id")
                .select([
                    "inbound_deliveries.attempt_count",
                    "inbound_deliveries.last_core_order_id",
                    "inbound_deliveries.last_http_status",
                    "inbound_deliveries.status",
                    "delivery_attempts.outcome"
                ])
                .where("inbound_deliveries.id", "=", accepted.deliveryId)
                .executeTakeFirst();
            return delivery?.status === "DELIVERED" ? delivery : undefined;
        });

        expect(persisted).toEqual({
            attempt_count: 1,
            last_core_order_id: CORE_ORDER_ID,
            last_http_status: 201,
            outcome: "DELIVERED",
            status: "DELIVERED"
        });
        expect(coreRequests).toHaveLength(1);
        expect(coreRequests[0]).toMatchObject({
            method: "POST",
            sourceApiKey: CORE_SOURCE_API_KEY,
            url: "/api/v1/orders"
        });
        expect(JSON.parse(coreRequests[0]!.body)).toEqual({
            currency: "EUR",
            declaredTotalAmount: "39.98",
            externalId: "MA-WORKER-PROCESS",
            items: [
                {
                    externalLineId: "1",
                    quantity: "2",
                    sku: "SKU-BOOK-1",
                    unitPrice: "19.99"
                }
            ]
        });

        const metricsResponse = await fetch(`http://127.0.0.1:${gatewayPort}/metrics`);
        const metrics = await metricsResponse.text();
        expect(metricsResponse.status).toBe(200);
        expect(metricsResponse.headers.get("content-type")).toBe(
            "text/plain; version=0.0.4; charset=utf-8"
        );
        expect(metrics).toContain(
            'connector_gateway_delivery_worker_deliveries_total{outcome="claimed"} 1'
        );
        expect(metrics).toContain(
            'connector_gateway_delivery_worker_deliveries_total{outcome="delivered"} 1'
        );
        expect(metrics).toContain(
            'connector_gateway_delivery_worker_cycles_total{outcome="completed"}'
        );
        expect(metrics).toContain("connector_gateway_process_resident_memory_bytes");

        gatewayProcess!.kill("SIGTERM");
        await expect(waitForProcessExit(gatewayProcess!)).resolves.toEqual({
            code: 0,
            signal: null
        });
        expect(gatewayOutput).toContain("Shutting down connector gateway");
        expect(gatewayOutput).not.toContain(CORE_SOURCE_API_KEY);
        expect(gatewayOutput).not.toContain(WEBHOOK_SECRET_BASE64);
    });
});

async function captureCoreRequest(
    request: IncomingMessage,
    response: ServerResponse,
    requests: CapturedCoreRequest[]
): Promise<void> {
    requests.push({
        body: await text(request),
        method: request.method,
        sourceApiKey:
            typeof request.headers["x-source-api-key"] === "string"
                ? request.headers["x-source-api-key"]
                : undefined,
        url: request.url
    });
    response.writeHead(201, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: CORE_ORDER_ID }));
}

async function listenOnRandomPort(server: Server): Promise<number> {
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("Expected an IP listener for the test server");
    }
    return address.port;
}

async function reserveRandomPort(): Promise<number> {
    const server = createServer();
    const port = await listenOnRandomPort(server);
    await closeServer(server);
    return port;
}

function closeServer(server: Server | undefined): Promise<void> {
    if (server === undefined || !server.listening) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
}

async function waitFor<T>(
    operation: () => Promise<T | false | undefined>,
    timeoutMilliseconds = 10_000
): Promise<T> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
        const result = await operation();
        if (result !== false && result !== undefined) {
            return result;
        }
        await delay(50);
    }
    throw new Error(`Condition not met within ${timeoutMilliseconds} ms`);
}

function waitForProcessExit(
    childProcess: ChildProcess,
    timeoutMilliseconds = 10_000
): Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }> {
    if (childProcess.exitCode !== null) {
        return Promise.resolve({ code: childProcess.exitCode, signal: childProcess.signalCode });
    }
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error(`Process did not exit within ${timeoutMilliseconds} ms`)),
            timeoutMilliseconds
        );
        childProcess.once("exit", (code, signal) => {
            clearTimeout(timeout);
            resolve({ code, signal });
        });
    });
}
