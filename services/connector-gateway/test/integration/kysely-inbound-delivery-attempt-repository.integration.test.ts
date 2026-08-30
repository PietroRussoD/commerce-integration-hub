import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { StartInboundDeliveryAttemptCommand } from "../../src/application/deliveries/start-inbound-delivery-attempt.js";
import type { CompleteDeliveredInboundDeliveryAttemptCommand } from "../../src/application/deliveries/complete-delivered-inbound-delivery-attempt.js";
import type { CompleteRetryableInboundDeliveryAttemptCommand } from "../../src/application/deliveries/complete-retryable-inbound-delivery-attempt.js";
import type { CompleteTerminalInboundDeliveryAttemptCommand } from "../../src/application/deliveries/complete-terminal-inbound-delivery-attempt.js";
import type { RecoverExpiredInboundDeliveryCommand } from "../../src/application/deliveries/recover-expired-inbound-deliveries.js";
import { readMarketplaceAConnectorId } from "../../src/connectors/marketplace-a/connector-configuration.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryAttemptRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-attempt-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CONNECTOR_ID = readMarketplaceAConnectorId({});
const DELIVERY_ID = "0199037b-6400-7000-8000-000000000721";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000722";
const CORE_ORDER_ID = "0199037b-6400-7000-8000-000000000726";
const RECEIVED_AT = new Date("2026-08-30T08:00:00.000Z");
const NOW = new Date("2026-08-30T09:00:00.000Z");
const COMPLETED_AT = new Date("2026-08-30T09:00:30.125Z");

describe("KyselyInboundDeliveryAttemptRepository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let repository: KyselyInboundDeliveryAttemptRepository;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 4
        });
        await migrateToLatest(database);
        repository = new KyselyInboundDeliveryAttemptRepository(database);
    });

    beforeEach(async () => {
        await database.deleteFrom("delivery_attempts").execute();
        await database.deleteFrom("inbound_deliveries").execute();
        await database
            .updateTable("connector_configurations")
            .set({ status: "ACTIVE" })
            .where("id", "=", CONNECTOR_ID)
            .execute();
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
            deliveryReceivedAt: RECEIVED_AT,
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

    it("closes the attempt and schedules a retry", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(repository.completeRetryable(retryCommand())).resolves.toEqual({
            outcome: "COMPLETED"
        });

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select([
                    "status",
                    "attempt_count",
                    "next_attempt_at",
                    "error_code",
                    "last_http_status",
                    "lease_token",
                    "completed_at"
                ])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            status: "RETRY_WAIT",
            attempt_count: 1,
            next_attempt_at: new Date("2026-08-30T09:00:05.125Z"),
            error_code: "CORE_RETRYABLE_STATUS",
            last_http_status: 503,
            lease_token: null,
            completed_at: null
        });
        await expect(
            database
                .selectFrom("delivery_attempts")
                .select(["completed_at", "duration_ms", "error_code", "http_status", "outcome"])
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            completed_at: new Date("2026-08-30T09:00:00.125Z"),
            duration_ms: 125,
            error_code: "CORE_RETRYABLE_STATUS",
            http_status: 503,
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("closes the delivery when retry policy is exhausted", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(repository.completeRetryable(exhaustedCommand())).resolves.toEqual({
            outcome: "COMPLETED"
        });

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select([
                    "status",
                    "next_attempt_at",
                    "error_code",
                    "last_http_status",
                    "lease_owner",
                    "completed_at"
                ])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            status: "EXHAUSTED",
            next_attempt_at: new Date("2026-08-30T09:00:00.125Z"),
            error_code: "CORE_TIMEOUT",
            last_http_status: null,
            lease_owner: null,
            completed_at: new Date("2026-08-30T09:00:00.125Z")
        });
    });

    it("rejects retry completion from a stale claim", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(
            repository.completeRetryable({
                ...retryCommand(),
                leaseToken: "0199037b-6400-7000-8000-000000000728"
            })
        ).resolves.toEqual({ outcome: "STALE_CLAIM" });
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["status", "lease_token"])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ status: "FORWARDING", lease_token: LEASE_TOKEN });
    });

    it("rolls back retry completion for a mismatched attempt number", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(
            repository.completeRetryable({ ...retryCommand(), attemptNumber: 2 })
        ).rejects.toThrow("Current delivery attempt number does not match");
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["status", "lease_token"])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ status: "FORWARDING", lease_token: LEASE_TOKEN });
    });

    it("closes a permanently failed attempt and delivery", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(repository.completeTerminal(permanentCommand())).resolves.toEqual({
            outcome: "COMPLETED"
        });

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select([
                    "status",
                    "error_code",
                    "last_http_status",
                    "lease_token",
                    "completed_at"
                ])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            status: "PERMANENT_FAILURE",
            error_code: "CORE_REQUEST_REJECTED",
            last_http_status: 422,
            lease_token: null,
            completed_at: new Date("2026-08-30T09:00:00.125Z")
        });
        await expect(
            database
                .selectFrom("delivery_attempts")
                .select(["outcome", "error_code", "http_status", "duration_ms"])
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            outcome: "PERMANENT_FAILURE",
            error_code: "CORE_REQUEST_REJECTED",
            http_status: 422,
            duration_ms: 125
        });
    });

    it("blocks an active connector after core authentication rejection", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(repository.completeTerminal(blockedCommand())).resolves.toEqual({
            outcome: "COMPLETED"
        });

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["status", "error_code", "last_http_status"])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            status: "BLOCKED_CONFIGURATION",
            error_code: "CORE_AUTHENTICATION_REJECTED",
            last_http_status: 401
        });
        await expect(
            database
                .selectFrom("connector_configurations")
                .select("status")
                .where("id", "=", CONNECTOR_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ status: "BLOCKED_CONFIGURATION" });
    });

    it("does not replace an administrative connector disable", async () => {
        await insertDelivery();
        await repository.start(startCommand());
        await database
            .updateTable("connector_configurations")
            .set({ status: "DISABLED" })
            .where("id", "=", CONNECTOR_ID)
            .execute();

        await repository.completeTerminal(blockedCommand());

        await expect(
            database
                .selectFrom("connector_configurations")
                .select("status")
                .where("id", "=", CONNECTOR_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ status: "DISABLED" });
    });

    it("rejects terminal completion from a stale claim", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(
            repository.completeTerminal({
                ...permanentCommand(),
                leaseToken: "0199037b-6400-7000-8000-000000000729"
            })
        ).resolves.toEqual({ outcome: "STALE_CLAIM" });
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["status", "lease_token"])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ status: "FORWARDING", lease_token: LEASE_TOKEN });
    });

    it("finds expired claims and returns a pre-attempt claim to the queue", async () => {
        await insertDelivery();
        const recoveredAt = new Date("2026-08-30T09:00:30.000Z");

        await expect(
            repository.findExpired({ expiredAt: recoveredAt, limit: 10 })
        ).resolves.toEqual([
            {
                attemptId: null,
                attemptNumber: 0,
                deliveryId: DELIVERY_ID,
                deliveryReceivedAt: RECEIVED_AT,
                leaseOwner: "gateway-worker-1",
                leaseToken: LEASE_TOKEN
            }
        ]);
        await expect(
            repository.recoverExpired(recoveryCommand({ recoveredAt }))
        ).resolves.toEqual({ outcome: "RECOVERED" });
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select([
                    "status",
                    "attempt_count",
                    "next_attempt_at",
                    "error_code",
                    "lease_token"
                ])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            status: "RETRY_WAIT",
            attempt_count: 0,
            next_attempt_at: recoveredAt,
            error_code: "CLAIM_LEASE_EXPIRED",
            lease_token: null
        });
    });

    it("closes an open attempt while recovering its expired claim", async () => {
        await insertDelivery();
        await repository.start(startCommand());
        const recoveredAt = new Date("2026-08-30T09:00:30.000Z");

        await expect(
            repository.recoverExpired(
                recoveryCommand({
                    attemptId: startCommand().attemptId,
                    attemptNumber: 1,
                    errorCode: "ATTEMPT_LEASE_EXPIRED",
                    nextAttemptAt: new Date("2026-08-30T09:00:32.500Z"),
                    recoveredAt
                })
            )
        ).resolves.toEqual({ outcome: "RECOVERED" });
        await expect(
            database
                .selectFrom("delivery_attempts")
                .select(["completed_at", "duration_ms", "error_code", "outcome"])
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            completed_at: recoveredAt,
            duration_ms: 30_000,
            error_code: "ATTEMPT_LEASE_EXPIRED",
            outcome: "RETRYABLE_FAILURE"
        });
    });

    it("rejects recovery after another worker has replaced the claim", async () => {
        await insertDelivery();

        await expect(
            repository.recoverExpired(
                recoveryCommand({
                    leaseToken: "0199037b-6400-7000-8000-000000000754"
                })
            )
        ).resolves.toEqual({ outcome: "STALE_CLAIM" });
    });

    it("rolls back recovery when the observed open attempt has changed", async () => {
        await insertDelivery();
        await repository.start(startCommand());

        await expect(
            repository.recoverExpired(
                recoveryCommand({ attemptNumber: 1, attemptId: null })
            )
        ).rejects.toThrow("Current open delivery attempt changed during recovery");
        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select(["status", "lease_token"])
                .where("id", "=", DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({ status: "FORWARDING", lease_token: LEASE_TOKEN });
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

    function recoveryCommand(
        overrides: Partial<RecoverExpiredInboundDeliveryCommand> = {}
    ): RecoverExpiredInboundDeliveryCommand {
        return {
            attemptId: null,
            attemptNumber: 0,
            deliveryId: DELIVERY_ID,
            errorCode: "CLAIM_LEASE_EXPIRED",
            leaseOwner: "gateway-worker-1",
            leaseToken: LEASE_TOKEN,
            nextAttemptAt: new Date("2026-08-30T09:00:30.000Z"),
            recoveredAt: new Date("2026-08-30T09:00:30.000Z"),
            targetStatus: "RETRY_WAIT",
            ...overrides
        };
    }

    function retryCommand(): CompleteRetryableInboundDeliveryAttemptCommand {
        return {
            attemptId: "0199037b-6400-7000-8000-000000000723",
            attemptNumber: 1,
            completedAt: new Date("2026-08-30T09:00:00.125Z"),
            deliveryId: DELIVERY_ID,
            deliveryReceivedAt: RECEIVED_AT,
            errorCode: "CORE_RETRYABLE_STATUS",
            httpStatus: 503,
            leaseToken: LEASE_TOKEN,
            nextAttemptAt: new Date("2026-08-30T09:00:05.125Z"),
            targetStatus: "RETRY_WAIT",
            workerId: "gateway-worker-1"
        };
    }

    function exhaustedCommand(): CompleteRetryableInboundDeliveryAttemptCommand {
        return {
            attemptId: "0199037b-6400-7000-8000-000000000723",
            attemptNumber: 1,
            completedAt: new Date("2026-08-30T09:00:00.125Z"),
            deliveryId: DELIVERY_ID,
            deliveryReceivedAt: RECEIVED_AT,
            errorCode: "CORE_TIMEOUT",
            leaseToken: LEASE_TOKEN,
            targetStatus: "EXHAUSTED",
            workerId: "gateway-worker-1"
        };
    }

    function permanentCommand(): CompleteTerminalInboundDeliveryAttemptCommand {
        return {
            attemptId: "0199037b-6400-7000-8000-000000000723",
            attemptNumber: 1,
            completedAt: new Date("2026-08-30T09:00:00.125Z"),
            deliveryId: DELIVERY_ID,
            errorCode: "CORE_REQUEST_REJECTED",
            httpStatus: 422,
            leaseToken: LEASE_TOKEN,
            outcome: "PERMANENT_FAILURE",
            workerId: "gateway-worker-1"
        };
    }

    function blockedCommand(): CompleteTerminalInboundDeliveryAttemptCommand {
        return {
            attemptId: "0199037b-6400-7000-8000-000000000723",
            attemptNumber: 1,
            completedAt: new Date("2026-08-30T09:00:00.125Z"),
            deliveryId: DELIVERY_ID,
            errorCode: "CORE_AUTHENTICATION_REJECTED",
            httpStatus: 401,
            leaseToken: LEASE_TOKEN,
            outcome: "BLOCKED_CONFIGURATION",
            workerId: "gateway-worker-1"
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
                received_at: RECEIVED_AT,
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
