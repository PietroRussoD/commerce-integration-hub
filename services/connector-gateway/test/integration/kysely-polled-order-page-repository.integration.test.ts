import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ReceiveInboundDeliveryCommand } from "../../src/application/deliveries/receive-inbound-delivery-command.js";
import type {
    CommitPolledOrderPageCommand,
    RejectedInboundDeliveryCommand
} from "../../src/application/polling/commit-polled-order-page.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";
import { KyselyPolledOrderPageRepository } from "../../src/infrastructure/database/kysely-polled-order-page-repository.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000401";
const POLLED_AT = new Date("2026-09-01T09:00:00.000Z");
const LEASE_EXPIRES_AT = new Date("2026-09-01T09:01:00.000Z");

const DELIVERY: ReceiveInboundDeliveryCommand = {
    externalEventId: "chg-1001",
    providerPayloadHash: "a".repeat(64),
    providerPayloadJson: JSON.stringify({ changeId: "chg-1001", orderCode: "ERP-1001" }),
    mappingVersion: "erp-b-order-v1",
    canonicalOrder: {
        externalId: "ERP-1001",
        currency: "EUR",
        declaredTotalAmount: "39.98",
        items: [
            {
                externalLineId: "1",
                sku: "SKU-1",
                quantity: "2",
                unitPrice: "19.99"
            }
        ]
    }
};

const REJECTION: RejectedInboundDeliveryCommand = {
    externalEventId: "chg-1002",
    providerPayloadHash: "b".repeat(64),
    providerPayloadJson: JSON.stringify({ changeId: "chg-1002", currencyCode: "JPY" }),
    mappingVersion: "erp-b-order-v1",
    errorCode: "ERP_B_UNSUPPORTED_CURRENCY"
};

describe("KyselyPolledOrderPageRepository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let repository: KyselyPolledOrderPageRepository;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 8
        });
        await migrateToLatest(database);
        repository = new KyselyPolledOrderPageRepository(database);
    });

    beforeEach(async () => {
        await database.deleteFrom("inbound_deliveries").where("connector_id", "=", CONNECTOR_ID).execute();
        await resetCheckpoint();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("commits forwardable deliveries, poison records and checkpoint atomically", async () => {
        await expect(repository.commitPage(command())).resolves.toEqual({
            outcome: "COMMITTED",
            checkpointVersion: 2,
            createdDeliveries: 1,
            createdRejections: 1,
            equivalentReplays: 0
        });

        await expect(checkpoint()).resolves.toMatchObject({
            cursor: "opaque-cursor-43",
            last_polled_at: POLLED_AT,
            last_successful_poll_at: POLLED_AT,
            version: 2
        });
        await expect(storedDeliveries()).resolves.toEqual([
            {
                canonical_payload: DELIVERY.canonicalOrder,
                completed_at: null,
                error_code: null,
                external_event_id: "chg-1001",
                status: "RECEIVED"
            },
            {
                canonical_payload: null,
                completed_at: POLLED_AT,
                error_code: "ERP_B_UNSUPPORTED_CURRENCY",
                external_event_id: "chg-1002",
                status: "PERMANENT_FAILURE"
            }
        ]);
    });

    it("classifies a previously committed item as an equivalent replay", async () => {
        await repository.commitPage(command({ rejectedChanges: [] }));

        await expect(
            repository.commitPage(
                command({
                    expectedCheckpointVersion: 2,
                    nextCursor: "opaque-cursor-44",
                    rejectedChanges: []
                })
            )
        ).resolves.toEqual({
            outcome: "COMMITTED",
            checkpointVersion: 3,
            createdDeliveries: 0,
            createdRejections: 0,
            equivalentReplays: 1
        });
        await expect(deliveryCount()).resolves.toBe(1);
        await expect(checkpoint()).resolves.toMatchObject({
            cursor: "opaque-cursor-44",
            version: 3
        });
    });

    it("rolls back earlier inserts and the checkpoint on a payload conflict", async () => {
        await repository.commitPage(command({ rejectedChanges: [] }));
        await resetCheckpoint();

        const precedingDelivery: ReceiveInboundDeliveryCommand = {
            ...DELIVERY,
            externalEventId: "chg-1000",
            providerPayloadHash: "c".repeat(64),
            providerPayloadJson: JSON.stringify({ changeId: "chg-1000" })
        };
        const conflictingDelivery: ReceiveInboundDeliveryCommand = {
            ...DELIVERY,
            providerPayloadHash: "d".repeat(64),
            providerPayloadJson: JSON.stringify({ changeId: "chg-1001", changed: true })
        };

        await expect(
            repository.commitPage(
                command({
                    deliveries: [precedingDelivery, conflictingDelivery],
                    rejectedChanges: []
                })
            )
        ).resolves.toEqual({
            outcome: "PAYLOAD_CONFLICT",
            externalEventId: "chg-1001"
        });
        await expect(deliveryCount()).resolves.toBe(1);
        await expect(checkpoint()).resolves.toMatchObject({ cursor: null, version: 1 });
    });

    it("does not write when checkpoint ownership is stale", async () => {
        await expect(
            repository.commitPage(command({ expectedCheckpointVersion: 2 }))
        ).resolves.toEqual({ outcome: "STALE_CHECKPOINT" });

        await expect(deliveryCount()).resolves.toBe(0);
        await expect(checkpoint()).resolves.toMatchObject({ cursor: null, version: 1 });
    });

    it("allows only one concurrent poller to advance the same checkpoint version", async () => {
        const results = await Promise.all([
            repository.commitPage(command()),
            repository.commitPage(command())
        ]);

        expect(results).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ outcome: "COMMITTED", checkpointVersion: 2 }),
                { outcome: "STALE_CHECKPOINT" }
            ])
        );
        await expect(deliveryCount()).resolves.toBe(2);
        await expect(checkpoint()).resolves.toMatchObject({
            cursor: "opaque-cursor-43",
            version: 2
        });
    });

    it("propagates a constraint failure and rolls back the complete page", async () => {
        await expect(
            repository.commitPage(
                command({
                    rejectedChanges: [{ ...REJECTION, errorCode: "UNBOUNDED_PROVIDER_ERROR" }]
                })
            )
        ).rejects.toMatchObject({ code: "23514" });

        await expect(deliveryCount()).resolves.toBe(0);
        await expect(checkpoint()).resolves.toMatchObject({ cursor: null, version: 1 });
    });

    function command(
        overrides: Partial<CommitPolledOrderPageCommand> = {}
    ): CommitPolledOrderPageCommand {
        return {
            connectorId: CONNECTOR_ID,
            expectedCheckpointVersion: 1,
            leaseOwner: "poller-a",
            leaseToken: LEASE_TOKEN,
            polledAt: POLLED_AT,
            nextCursor: "opaque-cursor-43",
            deliveries: [DELIVERY],
            rejectedChanges: [REJECTION],
            ...overrides
        };
    }

    async function resetCheckpoint(): Promise<void> {
        await database
            .updateTable("polling_checkpoints")
            .set({
                cursor: null,
                version: 1,
                lease_owner: "poller-a",
                lease_token: LEASE_TOKEN,
                lease_expires_at: LEASE_EXPIRES_AT,
                last_polled_at: null,
                last_successful_poll_at: null,
                updated_at: POLLED_AT
            })
            .where("connector_id", "=", CONNECTOR_ID)
            .execute();
    }

    async function checkpoint() {
        return database
            .selectFrom("polling_checkpoints")
            .select(["cursor", "last_polled_at", "last_successful_poll_at", "version"])
            .where("connector_id", "=", CONNECTOR_ID)
            .executeTakeFirstOrThrow();
    }

    async function storedDeliveries() {
        return database
            .selectFrom("inbound_deliveries")
            .select([
                "canonical_payload",
                "completed_at",
                "error_code",
                "external_event_id",
                "status"
            ])
            .where("connector_id", "=", CONNECTOR_ID)
            .orderBy("external_event_id")
            .execute();
    }

    async function deliveryCount(): Promise<number> {
        const result = await database
            .selectFrom("inbound_deliveries")
            .select(({ fn }) => fn.countAll<number>().as("count"))
            .where("connector_id", "=", CONNECTOR_ID)
            .executeTakeFirstOrThrow();
        return Number(result.count);
    }
});
