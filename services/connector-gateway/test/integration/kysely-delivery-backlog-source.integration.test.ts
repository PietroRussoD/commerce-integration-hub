import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { readMarketplaceAConnectorId } from "../../src/connectors/marketplace-a/connector-configuration.js";
import {
    createDatabase,
    type GatewayDatabase,
    type InboundDeliveryStatus
} from "../../src/infrastructure/database/database.js";
import { KyselyDeliveryBacklogSource } from "../../src/infrastructure/database/kysely-delivery-backlog-source.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const CONNECTOR_ID = readMarketplaceAConnectorId({});
const OBSERVED_AT = new Date("2026-09-02T09:00:00.000Z");

describe("KyselyDeliveryBacklogSource", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let source: KyselyDeliveryBacklogSource;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 4
        });
        await migrateToLatest(database);
        source = new KyselyDeliveryBacklogSource(database);
    });

    beforeEach(async () => {
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

    it("reads only deliveries currently eligible for forwarding", async () => {
        await insertDelivery("000000000801", "eligible-received", "RECEIVED", -120, -60, true);
        await insertDelivery("000000000802", "eligible-retry", "RETRY_WAIT", -90, -30, true);
        await insertDelivery("000000000803", "future", "RECEIVED", -180, 60, true);
        await insertDelivery("000000000804", "poison", "PERMANENT_FAILURE", -240, -120, false);

        await expect(source.readDeliveryBacklog(OBSERVED_AT)).resolves.toEqual({
            eligibleDeliveries: 2,
            oldestEligibleReceivedAt: new Date("2026-09-02T08:58:00.000Z")
        });
    });

    it("excludes otherwise eligible deliveries after the connector is blocked", async () => {
        await insertDelivery("000000000805", "blocked", "RECEIVED", -60, -30, true);
        await database
            .updateTable("connector_configurations")
            .set({ status: "BLOCKED_CONFIGURATION" })
            .where("id", "=", CONNECTOR_ID)
            .execute();

        await expect(source.readDeliveryBacklog(OBSERVED_AT)).resolves.toEqual({
            eligibleDeliveries: 0,
            oldestEligibleReceivedAt: null
        });
    });

    async function insertDelivery(
        idSuffix: string,
        eventId: string,
        status: InboundDeliveryStatus,
        receivedOffsetSeconds: number,
        nextAttemptOffsetSeconds: number,
        canonical: boolean
    ): Promise<void> {
        await database
            .insertInto("inbound_deliveries")
            .values({
                id: `0199037b-6400-7000-8000-${idSuffix}`,
                connector_id: CONNECTOR_ID,
                external_event_id: eventId,
                provider_payload_hash: "a".repeat(64),
                raw_payload: { eventId },
                canonical_payload: canonical
                    ? {
                          currency: "EUR",
                          declaredTotalAmount: "10.00",
                          externalId: `order-${eventId}`,
                          items: [
                              {
                                  externalLineId: "line-1",
                                  quantity: "1",
                                  sku: "SKU-1",
                                  unitPrice: "10.00"
                              }
                          ]
                      }
                    : null,
                mapping_version: "marketplace-a-order-v1",
                status,
                next_attempt_at: offsetDate(nextAttemptOffsetSeconds),
                received_at: offsetDate(receivedOffsetSeconds),
                lease_owner: null,
                lease_expires_at: null,
                error_code: canonical ? null : "ERP_B_UNSUPPORTED_CURRENCY",
                safe_error_message: null,
                last_http_status: null,
                correlation_id: null,
                last_core_order_id: null,
                completed_at: canonical ? null : offsetDate(-120)
            })
            .execute();
    }
});

function offsetDate(seconds: number): Date {
    return new Date(OBSERVED_AT.getTime() + seconds * 1_000);
}
