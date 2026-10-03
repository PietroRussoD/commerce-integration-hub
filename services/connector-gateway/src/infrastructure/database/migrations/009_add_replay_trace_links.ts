import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    await database.schema
        .alterTable("delivery_attempts")
        .addColumn("traceparent", "varchar(55)")
        .addColumn("tracestate", "varchar(512)")
        .execute();
    await database.schema
        .alterTable("inbound_deliveries")
        .addColumn("replay_link_traceparent", "varchar(55)")
        .addColumn("replay_link_tracestate", "varchar(512)")
        .execute();

    await addTraceContextConstraints(database, "delivery_attempts", "delivery_attempts");
    await addTraceContextConstraints(database, "inbound_deliveries", "inbound_deliveries_replay_link", "replay_link_");
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await sql`
        ALTER TABLE inbound_deliveries
        DROP CONSTRAINT ck_inbound_deliveries_replay_link_tracestate,
        DROP CONSTRAINT ck_inbound_deliveries_replay_link_traceparent
    `.execute(database);
    await sql`
        ALTER TABLE delivery_attempts
        DROP CONSTRAINT ck_delivery_attempts_tracestate,
        DROP CONSTRAINT ck_delivery_attempts_traceparent
    `.execute(database);
    await database.schema
        .alterTable("inbound_deliveries")
        .dropColumn("replay_link_tracestate")
        .dropColumn("replay_link_traceparent")
        .execute();
    await database.schema
        .alterTable("delivery_attempts")
        .dropColumn("tracestate")
        .dropColumn("traceparent")
        .execute();
}

async function addTraceContextConstraints(
    database: Kysely<unknown>,
    table: "delivery_attempts" | "inbound_deliveries",
    constraintPrefix: string,
    columnPrefix = ""
): Promise<void> {
    await sql.raw(`
        ALTER TABLE ${table}
        ADD CONSTRAINT ck_${constraintPrefix}_traceparent
        CHECK (${columnPrefix}traceparent IS NULL OR (
            ${columnPrefix}traceparent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$'
            AND substring(${columnPrefix}traceparent from 4 for 32) <> repeat('0', 32)
            AND substring(${columnPrefix}traceparent from 37 for 16) <> repeat('0', 16)
        ))
    `).execute(database);
    await sql.raw(`
        ALTER TABLE ${table}
        ADD CONSTRAINT ck_${constraintPrefix}_tracestate
        CHECK (${columnPrefix}traceparent IS NOT NULL OR ${columnPrefix}tracestate IS NULL)
    `).execute(database);
}
