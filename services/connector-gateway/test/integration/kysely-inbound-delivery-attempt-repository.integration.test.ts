import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { StartInboundDeliveryAttemptCommand } from "../../src/application/deliveries/start-inbound-delivery-attempt.js";
import type { CompleteDeliveredInboundDeliveryAttemptCommand } from "../../src/application/deliveries/complete-delivered-inbound-delivery-attempt.js";
import { readMarketplaceAConnectorId } from "../../src/connectors/marketplace-a/connector-configuration.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryAttemptRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-attempt-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CONNECTOR_ID = readMarketplaceAConnectorId({});
const DELIVERY_ID = "0199037b-6400-7000-8000-000000000721";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000722";
const CORE_ORDER_ID = "0199037b-6400-7000-8000-000000000726";
const NOW = new Date("2026-08-30T09:00:00.000Z");
const COMPLETED_AT = new Date("2026-08-30T09:00:30.125Z");

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

    it("completes the current attempt and delivery after a successful response", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(repository.completeDelivered(completeCommand())).resolves.toEqual({
            outcome: "COMPLETED"
        });

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select([
                    "status",
                    "last_core_order_id",
                    "last_http_status",
                    "lease_owner",
                    "lease_token",
                    "lease_expires_at",
                    "completed_at"
                ])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            status: "DELIVERED",
            last_core_order_id: CORE_ORDER_ID,
            last_http_status: 201,
            lease_owner: null,
            lease_token: null,
            lease_expires_at: null,
            completed_at: COMPLETED_AT
        });
        await expect(
            database
                .selectFrom("delivery_attempts")
                .select([
                    "completed_at",
                    "duration_ms",
                    "error_code",
                    "http_status",
                    "outcome"
                ])
                .where("id", "=", completeCommand().attemptId)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            completed_at: COMPLETED_AT,
            duration_ms: 30_125,
            error_code: null,
            http_status: 201,
            outcome: "DELIVERED"
        });
    });

    it.each([
        ["wrong worker", { workerId: "other-worker" }],
        [
            "wrong token",
            { leaseToken: "0199037b-6400-7000-8000-000000000727" }
        ]
    ])("rejects delivered completion from a %s", async (_case, overrides) => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(
            repository.completeDelivered(completeCommand(overrides))
        ).resolves.toEqual({ outcome: "STALE_CLAIM" });
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["status", "lease_owner", "lease_token"])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            status: "FORWARDING",
            lease_owner: "gateway-worker-1",
            lease_token: LEASE_TOKEN
        });
        await expect(
            database
                .selectFrom("delivery_attempts")
                .select("completed_at")
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ completed_at: null });
    });

    it("rolls back delivered completion when current attempt evidence is missing", async () => {
        await insertDelivery();
        await database
            .updateTable("inbound_deliveries")
            .set({ attempt_count: 1 })
            .where("id", "=", DELIVERY_ID)
            .execute();

        await expect(repository.completeDelivered(completeCommand())).rejects.toThrow(
            "Current delivery attempt is missing or already completed"
        );
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["status", "last_core_order_id", "lease_token", "completed_at"])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            status: "FORWARDING",
            last_core_order_id: null,
            lease_token: LEASE_TOKEN,
            completed_at: null
        });
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

    function completeCommand(
        overrides: Partial<CompleteDeliveredInboundDeliveryAttemptCommand> = {}
    ): CompleteDeliveredInboundDeliveryAttemptCommand {
        return {
            attemptId: "0199037b-6400-7000-8000-000000000723",
            completedAt: COMPLETED_AT,
            coreOrderId: CORE_ORDER_ID,
            deliveryId: DELIVERY_ID,
            httpStatus: 201,
            leaseToken: LEASE_TOKEN,
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
