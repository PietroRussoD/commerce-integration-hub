import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    await sql`
        CREATE INDEX ix_inbound_deliveries_payload_retention
        ON inbound_deliveries (payload_expires_at, id)
        WHERE payload_cleared_at IS NULL
          AND status IN ('DELIVERED', 'PERMANENT_FAILURE', 'BLOCKED_CONFIGURATION', 'EXHAUSTED')
    `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await database.schema.dropIndex("ix_inbound_deliveries_payload_retention").execute();
}
