import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { StartInboundDeliveryAttemptCommand } from "../../src/application/deliveries/start-inbound-delivery-attempt.js";
import { readMarketplaceAConnectorId } from "../../src/connectors/marketplace-a/connector-configuration.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryAttemptRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-attempt-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CONNECTOR_ID = readMarketplaceAConnectorId({});
const DELIVERY_ID = "0199037b-6400-7000-8000-000000000721";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000722";
const NOW = new Date("2026-08-30T09:00:00.000Z");

describe("KyselyInboundDeliveryAttemptRepository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let repository: KyselyInboundDeliveryAttemptRepository;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionString: container.getConnectionUri(),
            maxPoolSize: 4
        });
        await migrateToLatest(database);
        repository = new KyselyInboundDeliveryAttemptRepository(database);
    });

    beforeEach(async () => {
        await database.deleteFrom("delivery_attempts").execute();
        await database.deleteFrom("inbound_deliveries").execute();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("increments and records an attempt for the current unexpired claim", async () => {
        await insertDelivery();

        await expect(repository.start(startCommand())).resolves.toEqual({
            attemptId: "0199037b-6400-7000-8000-000000000723",
            attemptNumber: 1,
            outcome: "STARTED",
            startedAt: NOW
        });

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["attempt_count", "updated_at"])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ attempt_count: 1, updated_at: NOW });
        await expect(
            database
                .selectFrom("delivery_attempts")
                .selectAll()
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            attempt_number: 1,
            completed_at: null,
            delivery_id: DELIVERY_ID,
            duration_ms: null,
            error_code: null,
            http_status: null,
            id: "0199037b-6400-7000-8000-000000000723",
            outcome: null,
            safe_error_message: null,
            started_at: NOW,
            trace_id: "a".repeat(32)
        });
    });

    it.each([
        ["wrong worker", { workerId: "other-worker" }, {}],
        [
            "wrong token",
            { leaseToken: "0199037b-6400-7000-8000-000000000724" },
            {}
        ],
        ["expired lease", {}, { leaseExpiresAt: NOW }],
        ["non-forwarding state", {}, { status: "RECEIVED" as const }]
    ])("rejects a %s as a stale claim", async (_case, commandOverrides, deliveryOverrides) => {
        await insertDelivery(deliveryOverrides);

        await expect(repository.start(startCommand(commandOverrides))).resolves.toEqual({
            outcome: "STALE_CLAIM"
        });
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select("attempt_count")
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ attempt_count: 0 });
        await expect(
            database.selectFrom("delivery_attempts").select("id").execute()
        ).resolves.toEqual([]);
    });

    it("rolls back the increment when attempt insertion fails", async () => {
        const otherDeliveryId = "0199037b-6400-7000-8000-000000000725";
        await insertDelivery();
        await insertDelivery({
            deliveryId: otherDeliveryId,
            eventId: "evt-other",
            status: "RECEIVED"
        });
        await database
            .insertInto("delivery_attempts")
            .values(openAttempt(otherDeliveryId))
            .execute();

        await expect(repository.start(startCommand())).rejects.toMatchObject({ code: "23505" });
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select("attempt_count")
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ attempt_count: 0 });
    });

    function startCommand(
        overrides: Partial<StartInboundDeliveryAttemptCommand> = {}
    ): StartInboundDeliveryAttemptCommand {
        return {
            attemptId: "0199037b-6400-7000-8000-000000000723",
            deliveryId: DELIVERY_ID,
            leaseToken: LEASE_TOKEN,
            startedAt: NOW,
            traceId: "a".repeat(32),
            workerId: "gateway-worker-1",
            ...overrides
        };
    }

    async function insertDelivery({
        deliveryId = DELIVERY_ID,
        eventId = "evt-attempt",
        leaseExpiresAt = new Date("2026-08-30T09:00:30.000Z"),
        status = "FORWARDING"
    }: {
        deliveryId?: string;
        eventId?: string;
        leaseExpiresAt?: Date;
        status?: "FORWARDING" | "RECEIVED";
    } = {}): Promise<void> {
        await database
            .insertInto("inbound_deliveries")
            .values({
                id: deliveryId,
                connector_id: CONNECTOR_ID,
                external_event_id: eventId,
                provider_payload_hash: "a".repeat(64),
                raw_payload: { eventId },
                canonical_payload: {
                    externalId: `order-${eventId}`,
                    currency: "EUR",
                    declaredTotalAmount: "10.00",
                    items: [
                        {
                            externalLineId: "line-1",
                            sku: "SKU-1",
                            quantity: "1",
                            unitPrice: "10.00"
                        }
                    ]
                },
                mapping_version: "marketplace-a-order-v1",
                status,
                lease_owner: status === "FORWARDING" ? "gateway-worker-1" : null,
                lease_token: status === "FORWARDING" ? LEASE_TOKEN : null,
                lease_expires_at: status === "FORWARDING" ? leaseExpiresAt : null,
                error_code: null,
                safe_error_message: null,
                last_http_status: null,
                correlation_id: null,
                last_core_order_id: null,
                completed_at: null
            })
            .execute();
    }

    function openAttempt(deliveryId: string) {
        return {
            id: "0199037b-6400-7000-8000-000000000723",
            delivery_id: deliveryId,
            attempt_number: 1,
            started_at: NOW,
            completed_at: null,
            outcome: null,
            http_status: null,
            error_code: null,
            safe_error_message: null,
            duration_ms: null,
            trace_id: null
        };
    }
});
