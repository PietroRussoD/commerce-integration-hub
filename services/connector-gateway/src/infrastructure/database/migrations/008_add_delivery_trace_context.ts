import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    await database.schema
        .alterTable("inbound_deliveries")
        .addColumn("traceparent", "varchar(55)")
        .addColumn("tracestate", "varchar(512)")
        .execute();

    await sql`
        ALTER TABLE inbound_deliveries
        ADD CONSTRAINT ck_inbound_deliveries_traceparent
        CHECK (traceparent IS NULL OR (
                traceparent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$'
                AND substring(traceparent from 4 for 32) <> repeat('0', 32)
                AND substring(traceparent from 37 for 16) <> repeat('0', 16)
            ))
    `.execute(database);
    await sql`
        ALTER TABLE inbound_deliveries
        ADD CONSTRAINT ck_inbound_deliveries_tracestate
        CHECK (traceparent IS NOT NULL OR tracestate IS NULL)
    `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await sql`
        ALTER TABLE inbound_deliveries
        DROP CONSTRAINT ck_inbound_deliveries_tracestate,
        DROP CONSTRAINT ck_inbound_deliveries_traceparent
    `.execute(database);
    await database.schema
        .alterTable("inbound_deliveries")
        .dropColumn("tracestate")
        .dropColumn("traceparent")
        .execute();
}
