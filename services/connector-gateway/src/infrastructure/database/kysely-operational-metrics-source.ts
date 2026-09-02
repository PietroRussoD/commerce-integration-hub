import { sql, type Kysely } from "kysely";

import type {
    GatewayOperationalMetricsSource,
    GatewayOperationalSnapshot
} from "../observability/connector-gateway-metrics.js";
import type { GatewayDatabase } from "./database.js";

interface OperationalSnapshotRow {
    readonly active_connectors: number;
    readonly blocked_connectors: number;
    readonly disabled_connectors: number;
    readonly eligible_deliveries: number;
    readonly last_successful_poll_at: Date | null;
    readonly oldest_eligible_received_at: Date | null;
}

export class KyselyOperationalMetricsSource implements GatewayOperationalMetricsSource {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public async readOperationalSnapshot(
        observedAt: Date
    ): Promise<GatewayOperationalSnapshot> {
        const result = await sql<OperationalSnapshotRow>`
            WITH eligible_deliveries AS (
                SELECT delivery.received_at
                FROM inbound_deliveries AS delivery
                INNER JOIN connector_configurations AS connector
                    ON connector.id = delivery.connector_id
                WHERE delivery.status IN ('RECEIVED', 'RETRY_WAIT')
                  AND delivery.canonical_payload IS NOT NULL
                  AND delivery.next_attempt_at <= ${observedAt}
                  AND connector.status = 'ACTIVE'
            )
            SELECT
                COUNT(*)::integer AS eligible_deliveries,
                MIN(received_at) AS oldest_eligible_received_at,
                (
                    SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::integer
                    FROM connector_configurations
                ) AS active_connectors,
                (
                    SELECT COUNT(*) FILTER (
                        WHERE status = 'BLOCKED_CONFIGURATION'
                    )::integer
                    FROM connector_configurations
                ) AS blocked_connectors,
                (
                    SELECT COUNT(*) FILTER (WHERE status = 'DISABLED')::integer
                    FROM connector_configurations
                ) AS disabled_connectors,
                (
                    SELECT MAX(checkpoint.last_successful_poll_at)
                    FROM polling_checkpoints AS checkpoint
                    INNER JOIN connector_configurations AS connector
                        ON connector.id = checkpoint.connector_id
                    WHERE connector.provider = 'ERP_B'
                      AND connector.mode = 'POLLING'
                ) AS last_successful_poll_at
            FROM eligible_deliveries
        `.execute(this.database);
        const snapshot = result.rows[0];
        if (snapshot === undefined) {
            throw new Error("Operational metrics query returned no snapshot");
        }

        return {
            activeConnectors: snapshot.active_connectors,
            blockedConnectors: snapshot.blocked_connectors,
            disabledConnectors: snapshot.disabled_connectors,
            eligibleDeliveries: snapshot.eligible_deliveries,
            lastSuccessfulPollAt: snapshot.last_successful_poll_at,
            oldestEligibleReceivedAt: snapshot.oldest_eligible_received_at
        };
    }
}
