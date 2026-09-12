import { createServer, type Server } from "node:http";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { FastifyInstance } from "fastify";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApplication } from "../../src/app.js";
import { createGetInboundDeliveryUseCase } from "../../src/application/deliveries/get-inbound-delivery.js";
import { createListInboundDeliveriesUseCase } from "../../src/application/deliveries/list-inbound-deliveries.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryInspectionRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-inspection-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";
import { createOperatorJwtVerifier } from "../../src/infrastructure/security/operator-jwt-verifier.js";

const AUDIENCE = "commerce-integration-hub-operators";
const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000901";
const DELIVERY_ID = "0199037b-6400-7000-8000-000000000911";
const ISSUER = "https://identity.example.test";
const KEY_ID = "operator-integration-test-key";

describe("operator delivery inspection API", () => {
    let application: FastifyInstance;
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let jwksServer: Server;
    let jwksUrl: URL;
    let privateKey: CryptoKey;

    beforeAll(async () => {
        const keyPair = await generateKeyPair("RS256");
        privateKey = keyPair.privateKey;
        jwksUrl = await startJwksServer(keyPair.publicKey);

        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 4
        });
        await migrateToLatest(database);
        await seedDelivery();

        const repository = new KyselyInboundDeliveryInspectionRepository(database);
        application = buildApplication({
            operatorDeliveries: {
                authorization: {
                    enabled: true,
                    verifyToken: createOperatorJwtVerifier({
                        audience: AUDIENCE,
                        authorizationEnabled: true,
                        clockToleranceSeconds: 0,
                        issuer: ISSUER,
                        jwksUrl,
                        oidcEnabled: true
                    })
                },
                getDelivery: createGetInboundDeliveryUseCase(repository),
                listDeliveries: createListInboundDeliveriesUseCase(repository)
            }
        });
    });

    afterAll(async () => {
        await application?.close();
        await database?.destroy();
        await stopJwksServer();
        await container?.stop();
    });

    it("authorizes real JWTs and returns persisted safe delivery data", async () => {
        const missingToken = await application.inject({
            method: "GET",
            url: "/api/v1/operator/deliveries"
        });
        const insufficientRole = await application.inject({
            method: "GET",
            url: "/api/v1/operator/deliveries",
            headers: { authorization: `Bearer ${await issueToken(["viewer"])}` }
        });
        const wrongAudience = await application.inject({
            method: "GET",
            url: "/api/v1/operator/deliveries",
            headers: {
                authorization: `Bearer ${await issueToken(["operator"], "different-audience")}`
            }
        });
        const operatorToken = await issueToken(["operator"]);
        const authorizedList = await application.inject({
            method: "GET",
            url: "/api/v1/operator/deliveries?provider=MARKETPLACE_A&status=EXHAUSTED",
            headers: { authorization: `Bearer ${operatorToken}` }
        });
        const authorizedDetail = await application.inject({
            method: "GET",
            url: `/api/v1/operator/deliveries/${DELIVERY_ID}`,
            headers: { authorization: `Bearer ${operatorToken}` }
        });

        expect(missingToken.statusCode).toBe(401);
        expect(insufficientRole.statusCode).toBe(403);
        expect(wrongAudience.statusCode).toBe(401);
        expect(authorizedList.statusCode).toBe(200);
        expect(authorizedList.json()).toMatchObject({
            items: [
                {
                    deliveryId: DELIVERY_ID,
                    externalEventId: "operator-api-event",
                    status: "EXHAUSTED"
                }
            ],
            nextCursor: null
        });
        expect(authorizedDetail.statusCode).toBe(200);
        expect(authorizedDetail.json()).toMatchObject({
            connectorId: CONNECTOR_ID,
            deliveryId: DELIVERY_ID,
            externalEventId: "operator-api-event",
            provider: "MARKETPLACE_A",
            status: "EXHAUSTED"
        });
        expect(authorizedDetail.json()).not.toHaveProperty("rawPayload");
        expect(authorizedDetail.json()).not.toHaveProperty("canonicalPayload");
    });

    async function issueToken(
        groups: readonly string[],
        audience: string = AUDIENCE
    ): Promise<string> {
        return new SignJWT({ groups })
            .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
            .setAudience(audience)
            .setExpirationTime("5m")
            .setIssuedAt()
            .setIssuer(ISSUER)
            .setSubject("operator-integration-test")
            .sign(privateKey);
    }

    async function seedDelivery(): Promise<void> {
        await database
            .insertInto("connector_configurations")
            .values({
                id: CONNECTOR_ID,
                mode: "WEBHOOK",
                provider: "MARKETPLACE_A",
                schedule: null,
                secret_reference: "env:MARKETPLACE_A_SECRET",
                source_system: "MARKETPLACE_A",
                status: "ACTIVE"
            })
            .execute();
        await database
            .insertInto("inbound_deliveries")
            .values({
                attempt_count: 3,
                canonical_payload: {
                    currency: "EUR",
                    declaredTotalAmount: "39.98",
                    externalId: "MA-OPERATOR-1",
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
                correlation_id: "0199037b-6400-7000-8000-000000000990",
                error_code: "CORE_REQUEST_REJECTED",
                external_event_id: "operator-api-event",
                id: DELIVERY_ID,
                last_core_order_id: null,
                last_http_status: 422,
                lease_expires_at: null,
                lease_owner: null,
                lease_token: null,
                mapping_version: "marketplace_a-order-v1",
                next_attempt_at: new Date("2026-09-11T10:00:00.000Z"),
                provider_payload_hash: "a".repeat(64),
                raw_payload: { privateProviderField: "not-for-operators" },
                received_at: sql<Date>`${"2026-09-11T10:00:00.123456Z"}::timestamptz`,
                safe_error_message: "Core rejected the canonical order",
                status: "EXHAUSTED",
                updated_at: new Date("2026-09-11T10:05:00.000Z")
            })
            .execute();
    }

    async function startJwksServer(publicKey: CryptoKey): Promise<URL> {
        const publicJwk = await exportJWK(publicKey);
        jwksServer = createServer((_request, response) => {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(
                JSON.stringify({
                    keys: [{ ...publicJwk, alg: "RS256", kid: KEY_ID, use: "sig" }]
                })
            );
        });
        await new Promise<void>((resolve, reject) => {
            jwksServer.once("error", reject);
            jwksServer.listen(0, "127.0.0.1", resolve);
        });
        const address = jwksServer.address();
        if (address === null || typeof address === "string") {
            throw new Error("JWKS server did not expose a TCP address");
        }
        return new URL(`http://127.0.0.1:${address.port}/jwks.json`);
    }

    async function stopJwksServer(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            jwksServer?.close((error) => (error === undefined ? resolve() : reject(error)));
        });
    }
});
