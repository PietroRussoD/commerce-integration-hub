import { sql, type Kysely, type Transaction } from "kysely";

import type { InboundDeliveryPayloadRetentionRepository } from "../../application/deliveries/clear-expired-inbound-delivery-payloads.js";
import type { GatewayDatabase } from "./database.js";

type RetentionDatabase = Kysely<GatewayDatabase> | Transaction<GatewayDatabase>;

export class KyselyInboundDeliveryPayloadRetentionRepository implements InboundDeliveryPayloadRetentionRepository {
    constructor(private readonly database: RetentionDatabase) {}

    async clearExpiredTerminalPayloads(limit: number): Promise<number> {
        // One statement is one atomic transaction, including row selection and
        // clearing. Keep the cutoff in PostgreSQL to preserve microsecond precision.
        // No connector, attempt, or audit locks are acquired by this operation.
        const result = await sql<{ id: string }>`
            WITH cutoff AS MATERIALIZED (
                SELECT clock_timestamp() AS cleared_at
            ), candidates AS MATERIALIZED (
                SELECT delivery.id, cutoff.cleared_at
                FROM inbound_deliveries AS delivery CROSS JOIN cutoff
                WHERE delivery.payload_cleared_at IS NULL
                  AND delivery.status IN ('DELIVERED', 'PERMANENT_FAILURE', 'BLOCKED_CONFIGURATION', 'EXHAUSTED')
                  AND delivery.payload_expires_at <= cutoff.cleared_at
                  AND delivery.completed_at <= cutoff.cleared_at
                ORDER BY delivery.payload_expires_at, delivery.id
                LIMIT ${limit}
                FOR UPDATE OF delivery SKIP LOCKED
            )
            UPDATE inbound_deliveries AS delivery
            SET raw_payload = NULL, canonical_payload = NULL,
                payload_cleared_at = candidates.cleared_at
            FROM candidates
            WHERE delivery.id = candidates.id
              AND delivery.payload_cleared_at IS NULL
              AND delivery.status IN ('DELIVERED', 'PERMANENT_FAILURE', 'BLOCKED_CONFIGURATION', 'EXHAUSTED')
              AND delivery.payload_expires_at <= candidates.cleared_at
              AND delivery.completed_at <= candidates.cleared_at
            RETURNING delivery.id
        `.execute(this.database);
        return result.rows.length;
    }
}
