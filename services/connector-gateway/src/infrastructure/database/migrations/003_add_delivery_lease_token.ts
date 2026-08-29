import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    await sql`
        ALTER TABLE inbound_deliveries
        DROP CONSTRAINT ck_inbound_deliveries_lease,
        ADD COLUMN lease_token uuid,
        ADD CONSTRAINT ck_inbound_deliveries_lease CHECK (
            (lease_owner IS NULL) = (lease_token IS NULL)
            AND (lease_owner IS NULL) = (lease_expires_at IS NULL)
        )
    `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await sql`
        ALTER TABLE inbound_deliveries
        DROP CONSTRAINT ck_inbound_deliveries_lease,
        DROP COLUMN lease_token,
        ADD CONSTRAINT ck_inbound_deliveries_lease CHECK (
            (lease_owner IS NULL) = (lease_expires_at IS NULL)
        )
    `.execute(database);
}
