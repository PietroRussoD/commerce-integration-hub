import { sql, type Kysely } from "kysely";

import type {
    DeliveryBacklogSnapshot,
    DeliveryBacklogSource
} from "../observability/connector-gateway-metrics.js";
import type { GatewayDatabase } from "./database.js";

export class KyselyDeliveryBacklogSource implements DeliveryBacklogSource {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public async readDeliveryBacklog(observedAt: Date): Promise<DeliveryBacklogSnapshot> {
        const snapshot = await this.database
            .selectFrom("inbound_deliveries as delivery")
            .innerJoin(
                "connector_configurations as connector",
                "connector.id",
                "delivery.connector_id"
            )
            .select([
                sql<number>`COUNT(*)::integer`.as("eligible_deliveries"),
                sql<Date | null>`MIN(delivery.received_at)`.as("oldest_eligible_received_at")
            ])
            .where("delivery.status", "in", ["RECEIVED", "RETRY_WAIT"])
            .where("delivery.canonical_payload", "is not", null)
            .where("delivery.next_attempt_at", "<=", observedAt)
            .where("connector.status", "=", "ACTIVE")
            .executeTakeFirstOrThrow();

        return {
            eligibleDeliveries: snapshot.eligible_deliveries,
            oldestEligibleReceivedAt: snapshot.oldest_eligible_received_at
        };
    }
}
