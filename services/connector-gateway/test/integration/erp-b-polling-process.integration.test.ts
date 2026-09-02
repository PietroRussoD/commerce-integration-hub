import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const ERP_B_API_TOKEN = "erp-b-process-test-token";
const WEBHOOK_SECRET_BASE64 = Buffer.alloc(32).toString("base64");

interface CapturedProviderRequest {
    readonly authorization: string | undefined;
    readonly cursor: string | null;
    readonly limit: string | null;
    readonly method: string | undefined;
    readonly pathname: string;
}

describe("Connector Gateway ERP_B polling process", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let gatewayProcess: ChildProcess | undefined;
    let gatewayOutput = "";
    let gatewayPort: number;
    let providerPort: number;
    let providerServer: Server | undefined;
    const providerRequests: CapturedProviderRequest[] = [];

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 4
        });
        await migrateToLatest(database);

        providerServer = createServer((request, response) => {
            serveProviderPage(request, response, providerRequests);
        });
        providerPort = await listenOnRandomPort(providerServer);
        gatewayPort = await reserveRandomPort();

        gatewayProcess = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                DATABASE_URL: container.getConnectionUri(),
                ERP_B_API_TOKEN,
                ERP_B_BASE_URL: `http://127.0.0.1:${providerPort}`,
                ERP_B_POLLING_ENABLED: "true",
                ERP_B_POLLING_INTERVAL_MILLISECONDS: "300000",
                ERP_B_POLLING_LEASE_DURATION_MILLISECONDS: "6000",
                ERP_B_POLLING_MAX_PAGES_PER_RUN: "10",
                ERP_B_POLLING_WORKER_ID: "erp-b-process-test-worker",
                ERP_B_TIMEOUT_MILLISECONDS: "100",
                HOST: "127.0.0.1",
                MARKETPLACE_A_WEBHOOK_CURRENT_KEY_ID: "process-test-key",
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
                return (await fetch(`http://127.0.0.1:${gatewayPort}/health/ready`)).ok;
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
        await closeServer(providerServer);
        await database?.destroy();
        await container?.stop();
    });

    it("polls two pages, persists every outcome, exposes metrics and shuts down", async () => {
        const checkpoint = await waitFor(async () => {
            const value = await database
                .selectFrom("polling_checkpoints")
                .select([
                    "cursor",
                    "last_successful_poll_at",
                    "lease_expires_at",
                    "lease_owner",
                    "lease_token",
                    "version"
                ])
                .where("connector_id", "=", CONNECTOR_ID)
                .executeTakeFirstOrThrow();
            return value.cursor === "opaque-cursor-complete" && value.lease_owner === null
                ? value
                : undefined;
        });

        expect(checkpoint).toMatchObject({
            cursor: "opaque-cursor-complete",
            lease_expires_at: null,
            lease_owner: null,
            lease_token: null,
            version: 3
        });
        expect(checkpoint.last_successful_poll_at).toBeInstanceOf(Date);

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["canonical_payload", "error_code", "external_event_id", "status"])
                .where("connector_id", "=", CONNECTOR_ID)
                .orderBy("external_event_id")
                .execute()
        ).resolves.toEqual([
            {
                canonical_payload: {
                    currency: "EUR",
                    declaredTotalAmount: "39.98",
                    externalId: "ERP-00042",
                    items: [
                        {
                            externalLineId: "1",
                            quantity: "2",
                            sku: "SKU-BOOK-1",
                            unitPrice: "19.99"
                        }
                    ]
                },
                error_code: null,
                external_event_id: "chg-00042",
                status: "RECEIVED"
            },
            {
                canonical_payload: null,
                error_code: "ERP_B_UNSUPPORTED_CURRENCY",
                external_event_id: "chg-00043",
                status: "PERMANENT_FAILURE"
            }
        ]);

        expect(providerRequests).toEqual([
            {
                authorization: `Bearer ${ERP_B_API_TOKEN}`,
                cursor: null,
                limit: "100",
                method: "GET",
                pathname: "/erp-b/v1/orders"
            },
            {
                authorization: `Bearer ${ERP_B_API_TOKEN}`,
                cursor: "opaque-cursor-2",
                limit: "100",
                method: "GET",
                pathname: "/erp-b/v1/orders"
            }
        ]);

        const metrics = await waitFor(async () => {
            const response = await fetch(`http://127.0.0.1:${gatewayPort}/metrics`);
            const exposition = await response.text();
            return response.ok &&
                exposition.includes(
                    'connector_gateway_erp_b_polling_runs_total{outcome="completed"} 1'
                )
                ? exposition
                : undefined;
        });
        expect(metrics).toContain(
            'connector_gateway_erp_b_polling_runs_total{outcome="completed"} 1'
        );
        expect(metrics).toContain("connector_gateway_erp_b_polling_run_active 0");
        expect(metrics).toContain("connector_gateway_erp_b_polling_pages_committed_total 2");
        expect(metrics).toContain(
            'connector_gateway_erp_b_polling_items_total{outcome="created_delivery"} 1'
        );
        expect(metrics).toContain(
            'connector_gateway_erp_b_polling_items_total{outcome="created_rejection"} 1'
        );

        gatewayProcess!.kill("SIGTERM");
        await expect(waitForProcessExit(gatewayProcess!)).resolves.toEqual({
            code: 0,
            signal: null
        });
        expect(gatewayOutput).toContain("ERP_B polling run completed");
        expect(gatewayOutput).toContain("Shutting down connector gateway");
        expect(gatewayOutput).not.toContain(ERP_B_API_TOKEN);
        expect(gatewayOutput).not.toContain(WEBHOOK_SECRET_BASE64);
    });
});

function serveProviderPage(
    request: IncomingMessage,
    response: ServerResponse,
    requests: CapturedProviderRequest[]
): void {
    const url = new URL(request.url ?? "/", "http://provider.test");
    requests.push({
        authorization: request.headers.authorization,
        cursor: url.searchParams.get("cursor"),
        limit: url.searchParams.get("limit"),
        method: request.method,
        pathname: url.pathname
    });

    const cursor = url.searchParams.get("cursor");
    const page = cursor === null ? firstPage() : finalPage(cursor);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(page));
}

function firstPage() {
    const validChange = {
        changeId: "chg-00042",
        currencyCode: "EUR",
        declaredTotal: "39.98",
        orderCode: "ERP-00042",
        positions: [
            {
                articleNumber: "SKU-BOOK-1",
                positionId: "1",
                pricePerUnit: "19.99",
                units: "2"
            }
        ]
    };
    return {
        hasMore: true,
        items: [validChange, { ...validChange, changeId: "chg-00043", currencyCode: "JPY" }],
        nextCursor: "opaque-cursor-2"
    };
}

function finalPage(cursor: string) {
    if (cursor !== "opaque-cursor-2") {
        throw new Error(`Unexpected provider cursor: ${cursor}`);
    }
    return {
        hasMore: false,
        items: [],
        nextCursor: "opaque-cursor-complete"
    };
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
