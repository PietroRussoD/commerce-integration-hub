import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ClaimInboundDeliveriesCommand } from "../../src/application/deliveries/claim-inbound-deliveries.js";
import { readMarketplaceAConnectorId } from "../../src/connectors/marketplace-a/connector-configuration.js";
import { createDatabase, type GatewayDatabase, type InboundDeliveryStatus } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryClaimRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-claim-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const ACTIVE_CONNECTOR_ID = readMarketplaceAConnectorId({});
const DISABLED_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000501";
const NOW = new Date("2026-08-29T18:00:00.000Z");

describe("KyselyInboundDeliveryClaimRepository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let repository: KyselyInboundDeliveryClaimRepository;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 8
        });
        await migrateToLatest(database);
        await database
            .insertInto("connector_configurations")
            .values({
                id: DISABLED_CONNECTOR_ID,
                provider: "ERP_B",
                source_system: "ERP_B",
                mode: "WEBHOOK",
                status: "DISABLED",
                schedule: null,
                secret_reference: "env:ERP_B_SECRET"
            })
            .execute();
        repository = new KyselyInboundDeliveryClaimRepository(database);
    });

    beforeEach(async () => {
        await database.deleteFrom("inbound_deliveries").execute();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("claims the oldest due delivery from an active connector", async () => {
        await insertDelivery({
            id: "0199037b-6400-7000-8000-000000000511",
            eventId: "evt-oldest",
            nextAttemptAt: new Date("2026-08-29T17:50:00.000Z"),
            receivedAt: new Date("2026-08-29T17:00:00.000Z")
        });
        await insertDelivery({
            id: "0199037b-6400-7000-8000-000000000512",
            eventId: "evt-retry",
            nextAttemptAt: new Date("2026-08-29T17:55:00.000Z"),
            receivedAt: new Date("2026-08-29T17:10:00.000Z"),
            status: "RETRY_WAIT"
        });
        await insertDelivery({
            id: "0199037b-6400-7000-8000-000000000513",
            eventId: "evt-future",
            nextAttemptAt: new Date("2026-08-29T18:01:00.000Z"),
            receivedAt: new Date("2026-08-29T17:20:00.000Z")
        });
        await insertDelivery({
            connectorId: DISABLED_CONNECTOR_ID,
            id: "0199037b-6400-7000-8000-000000000514",
            eventId: "evt-disabled",
            nextAttemptAt: new Date("2026-08-29T17:40:00.000Z"),
            receivedAt: new Date("2026-08-29T16:50:00.000Z")
        });

        const claimed = await repository.claimEligible(claimCommand("worker-a", "000000000521", 1));

        expect(claimed).toEqual([
            expect.objectContaining({
                connectorId: ACTIVE_CONNECTOR_ID,
                deliveryId: "0199037b-6400-7000-8000-000000000511",
                leaseToken: "0199037b-6400-7000-8000-000000000521"
            })
        ]);

        const stored = await database
            .selectFrom("inbound_deliveries")
            .select(["status", "attempt_count", "lease_owner", "lease_token", "lease_expires_at"])
            .where("id", "=", "0199037b-6400-7000-8000-000000000511")
            .executeTakeFirstOrThrow();
        expect(stored).toEqual({
            status: "FORWARDING",
            attempt_count: 0,
            lease_owner: "worker-a",
            lease_token: "0199037b-6400-7000-8000-000000000521",
            lease_expires_at: new Date("2026-08-29T18:00:30.000Z")
        });
    });

    it("returns an empty batch when no delivery is due", async () => {
        await insertDelivery({
            id: "0199037b-6400-7000-8000-000000000515",
            eventId: "evt-future-only",
            nextAttemptAt: new Date("2026-08-29T18:01:00.000Z"),
            receivedAt: NOW
        });

        await expect(
            repository.claimEligible(claimCommand("worker-a", "000000000522", 5))
        ).resolves.toEqual([]);
    });

    it("restores replay parent and link contexts from durable storage", async () => {
        const traceContext = {
            traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
            tracestate: "vendor=replay"
        };
        const replayLinkContext = {
            traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
            tracestate: "vendor=previous"
        };
        await insertDelivery({
            id: "0199037b-6400-7000-8000-000000000516",
            eventId: "evt-replay-link",
            nextAttemptAt: NOW,
            receivedAt: NOW,
            traceContext,
            replayLinkContext
        });

        const claimed = await repository.claimEligible(claimCommand("worker-a", "000000000523", 1));

        expect(claimed[0]).toMatchObject({ replayLinkContext, traceContext });
    });

    it("gives concurrent workers disjoint bounded batches", async () => {
        await Promise.all(
            Array.from({ length: 6 }, (_, index) =>
                insertDelivery({
                    id: `0199037b-6400-7000-8000-${String(531 + index).padStart(12, "0")}`,
                    eventId: `evt-concurrent-${index}`,
                    nextAttemptAt: new Date("2026-08-29T17:50:00.000Z"),
                    receivedAt: new Date(NOW.getTime() + index)
                })
            )
        );

        const [workerA, workerB] = await Promise.all([
            repository.claimEligible(claimCommand("worker-a", "000000000541", 3)),
            repository.claimEligible(claimCommand("worker-b", "000000000542", 3))
        ]);

        expect(workerA).toHaveLength(3);
        expect(workerB).toHaveLength(3);
        expect(new Set([...workerA, ...workerB].map(({ deliveryId }) => deliveryId))).toHaveLength(6);

        const ownership = await database
            .selectFrom("inbound_deliveries")
            .select(["lease_owner"])
            .orderBy("lease_owner")
            .execute();
        expect(ownership.map(({ lease_owner: leaseOwner }) => leaseOwner)).toEqual([
            "worker-a",
            "worker-a",
            "worker-a",
            "worker-b",
            "worker-b",
            "worker-b"
        ]);
    });

    function claimCommand(
        workerId: string,
        tokenSuffix: string,
        limit: number
    ): ClaimInboundDeliveriesCommand {
        return {
            claimedAt: NOW,
            leaseExpiresAt: new Date("2026-08-29T18:00:30.000Z"),
            leaseToken: `0199037b-6400-7000-8000-${tokenSuffix}`,
            limit,
            workerId
        };
    }

    async function insertDelivery({
        connectorId = ACTIVE_CONNECTOR_ID,
        eventId,
        id,
        nextAttemptAt,
        receivedAt,
        traceContext,
        replayLinkContext,
        status = "RECEIVED"
    }: {
        connectorId?: string;
        eventId: string;
        id: string;
        nextAttemptAt: Date;
        receivedAt: Date;
        replayLinkContext?: { readonly traceparent: string; readonly tracestate?: string };
        status?: InboundDeliveryStatus;
        traceContext?: { readonly traceparent: string; readonly tracestate?: string };
    }): Promise<void> {
        await database
            .insertInto("inbound_deliveries")
            .values({
                id,
                connector_id: connectorId,
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
                next_attempt_at: nextAttemptAt,
                received_at: receivedAt,
                lease_owner: null,
                lease_expires_at: null,
                error_code: null,
                safe_error_message: null,
                last_http_status: null,
                correlation_id: null,
                last_core_order_id: null,
                replay_link_traceparent: replayLinkContext?.traceparent ?? null,
                replay_link_tracestate: replayLinkContext?.tracestate ?? null,
                traceparent: traceContext?.traceparent ?? null,
                tracestate: traceContext?.tracestate ?? null,
                completed_at: null
            })
            .execute();
    }
});
