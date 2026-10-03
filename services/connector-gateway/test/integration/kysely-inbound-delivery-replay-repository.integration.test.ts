import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createReplayInboundDeliveryUseCase } from "../../src/application/deliveries/replay-inbound-delivery.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyInboundDeliveryReplayRepository } from "../../src/infrastructure/database/kysely-inbound-delivery-replay-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000001";
const EXPIRED_DELIVERY_ID = "0199037b-6400-7000-8000-000000000842";
const REPLAYABLE_DELIVERY_ID = "0199037b-6400-7000-8000-000000000841";
const REPLAYED_AT = new Date("2026-09-12T10:00:00.000Z");
const PREVIOUS_ATTEMPT_CONTEXT = {
    traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
    tracestate: "vendor=previous"
};
const REPLAY_REQUEST_CONTEXT = {
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    tracestate: "vendor=replay"
};

describe("Kysely inbound delivery replay repository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 2
        });
        await migrateToLatest(database);
        await database
            .insertInto("inbound_deliveries")
            .values([
                delivery(REPLAYABLE_DELIVERY_ID, "operator-replayable", "2026-10-12T10:00:00.000Z"),
                delivery(EXPIRED_DELIVERY_ID, "operator-expired", "2026-09-11T10:00:00.000Z")
            ])
            .execute();
        await database
            .insertInto("delivery_attempts")
            .values({
                id: "0199037b-6400-7000-8000-000000000871",
                delivery_id: REPLAYABLE_DELIVERY_ID,
                attempt_number: 5,
                started_at: new Date("2026-09-11T10:01:00.000Z"),
                completed_at: new Date("2026-09-11T10:05:00.000Z"),
                outcome: "RETRYABLE_FAILURE",
                http_status: 503,
                error_code: "CORE_UNAVAILABLE",
                safe_error_message: "Core was temporarily unavailable",
                duration_ms: 100,
                trace_id: "1".repeat(32),
                traceparent: PREVIOUS_ATTEMPT_CONTEXT.traceparent,
                tracestate: PREVIOUS_ATTEMPT_CONTEXT.tracestate
            })
            .execute();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("replays only durable exhausted deliveries and journals the exact outcome", async () => {
        const commandIds = [
            "0199037b-6400-7000-8000-000000000851",
            "0199037b-6400-7000-8000-000000000852",
            "0199037b-6400-7000-8000-000000000853",
            "0199037b-6400-7000-8000-000000000854"
        ];
        const replay = createReplayInboundDeliveryUseCase({
            createCommandId: () => commandIds.shift()!,
            currentTimeMilliseconds: () => REPLAYED_AT.getTime(),
            repository: new KyselyInboundDeliveryReplayRepository(database)
        });
        const replayableRequest = {
            actorSubject: "operator-44",
            deliveryId: REPLAYABLE_DELIVERY_ID,
            idempotencyKey: "0199037b-6400-7000-8000-000000000861",
            reason: "Retry after the upstream incident was resolved",
            traceContext: REPLAY_REQUEST_CONTEXT
        };

        await expect(replay(replayableRequest)).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000851",
            outcome: "REPLAYED"
        });
        await expect(replay(replayableRequest)).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000851",
            idempotent: true,
            outcome: "REPLAYED"
        });
        await expect(
            replay({ ...replayableRequest, reason: "Different operator intent" })
        ).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000851",
            outcome: "IDEMPOTENCY_CONFLICT"
        });
        await expect(
            replay({
                ...replayableRequest,
                deliveryId: EXPIRED_DELIVERY_ID,
                idempotencyKey: "0199037b-6400-7000-8000-000000000862"
            })
        ).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000854",
            outcome: "REJECTED",
            rejectionCode: "DELIVERY_PAYLOAD_EXPIRED"
        });

        await expect(
            database
                .selectFrom("inbound_deliveries")
                .select([
                    "attempt_count",
                    "completed_at",
                    "error_code",
                    "next_attempt_at",
                    "status",
                    "replay_link_traceparent",
                    "replay_link_tracestate",
                    "traceparent",
                    "tracestate"
                ])
                .where("id", "=", REPLAYABLE_DELIVERY_ID)
                .executeTakeFirstOrThrow()
        ).resolves.toEqual({
            attempt_count: 5,
            completed_at: null,
            error_code: null,
            next_attempt_at: REPLAYED_AT,
            status: "RECEIVED",
            replay_link_traceparent: PREVIOUS_ATTEMPT_CONTEXT.traceparent,
            replay_link_tracestate: PREVIOUS_ATTEMPT_CONTEXT.tracestate,
            traceparent: REPLAY_REQUEST_CONTEXT.traceparent,
            tracestate: REPLAY_REQUEST_CONTEXT.tracestate
        });
        const auditEntries = await database
            .selectFrom("operator_command_audit_entries")
            .select(["command_id", "error_code", "event_type"])
            .orderBy("command_id", "asc")
            .orderBy("event_type", "asc")
            .execute();
        expect(auditEntries).toEqual([
            {
                command_id: "0199037b-6400-7000-8000-000000000851",
                error_code: null,
                event_type: "REQUESTED"
            },
            {
                command_id: "0199037b-6400-7000-8000-000000000851",
                error_code: null,
                event_type: "SUCCEEDED"
            },
            {
                command_id: "0199037b-6400-7000-8000-000000000854",
                error_code: "DELIVERY_PAYLOAD_EXPIRED",
                event_type: "REJECTED"
            },
            {
                command_id: "0199037b-6400-7000-8000-000000000854",
                error_code: null,
                event_type: "REQUESTED"
            }
        ]);
    });
});

function delivery(id: string, externalEventId: string, payloadExpiresAt: string) {
    return {
        attempt_count: 5,
        canonical_payload: {
            currency: "EUR" as const,
            declaredTotalAmount: "39.98",
            externalId: `MA-${externalEventId}`,
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
        correlation_id: "0199037b-6400-7000-8000-000000000890",
        error_code: "CORE_UNAVAILABLE",
        external_event_id: externalEventId,
        id,
        last_core_order_id: null,
        last_http_status: 503,
        lease_expires_at: null,
        lease_owner: null,
        lease_token: null,
        mapping_version: "marketplace_a-order-v1",
        next_attempt_at: new Date("2026-09-11T10:05:00.000Z"),
        payload_expires_at: new Date(payloadExpiresAt),
        provider_payload_hash: "a".repeat(64),
        raw_payload: { privateProviderField: "not-for-operators" },
        received_at: new Date("2026-09-11T10:00:00.000Z"),
        safe_error_message: "Core was temporarily unavailable",
        status: "EXHAUSTED" as const,
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
        tracestate: "vendor=value",
        updated_at: new Date("2026-09-11T10:05:00.000Z")
    };
}
