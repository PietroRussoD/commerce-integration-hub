import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    await database.schema
        .createTable("operator_command_audit_entries")
        .addColumn("id", "uuid", (column) => column.primaryKey())
        .addColumn("command_id", "uuid", (column) => column.notNull())
        .addColumn("event_type", "varchar(20)", (column) => column.notNull())
        .addColumn("action", "varchar(100)", (column) => column.notNull())
        .addColumn("target_type", "varchar(100)", (column) => column.notNull())
        .addColumn("target_id", "uuid", (column) => column.notNull())
        .addColumn("actor_subject", "varchar(200)", (column) => column.notNull())
        .addColumn("reason", "varchar(1000)", (column) => column.notNull())
        .addColumn("idempotency_key", "uuid", (column) => column.notNull())
        .addColumn("error_code", "varchar(100)")
        .addColumn("occurred_at", "timestamptz", (column) => column.notNull())
        .addCheckConstraint(
            "ck_operator_command_audit_event_type",
            sql`event_type IN ('REQUESTED', 'SUCCEEDED', 'REJECTED', 'FAILED')`
        )
        .addCheckConstraint(
            "ck_operator_command_audit_action",
            sql`action <> '' AND action !~ '^[[:space:]]*$'`
        )
        .addCheckConstraint(
            "ck_operator_command_audit_target_type",
            sql`target_type <> '' AND target_type !~ '^[[:space:]]*$'`
        )
        .addCheckConstraint(
            "ck_operator_command_audit_actor_subject",
            sql`actor_subject <> '' AND actor_subject !~ '^[[:space:]]*$'`
        )
        .addCheckConstraint(
            "ck_operator_command_audit_reason",
            sql`reason <> '' AND reason !~ '^[[:space:]]*$'`
        )
        .addCheckConstraint(
            "ck_operator_command_audit_outcome",
            sql`(
                event_type IN ('REQUESTED', 'SUCCEEDED')
                AND error_code IS NULL
            ) OR (
                event_type IN ('REJECTED', 'FAILED')
                AND error_code IS NOT NULL
            )`
        )
        .execute();

    await sql`
        CREATE UNIQUE INDEX uk_operator_command_audit_request_idempotency
        ON operator_command_audit_entries (actor_subject, idempotency_key)
        WHERE event_type = 'REQUESTED'
    `.execute(database);
    await sql`
        CREATE UNIQUE INDEX uk_operator_command_audit_terminal_event
        ON operator_command_audit_entries (command_id)
        WHERE event_type IN ('SUCCEEDED', 'REJECTED', 'FAILED')
    `.execute(database);
    await sql`
        CREATE INDEX ix_operator_command_audit_target_occurred_at
        ON operator_command_audit_entries (target_type, target_id, occurred_at DESC)
    `.execute(database);
    await sql`
        CREATE FUNCTION reject_operator_command_audit_mutation()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RAISE EXCEPTION 'operator command audit entries are immutable'
                USING ERRCODE = '55000';
        END;
        $$
    `.execute(database);
    await sql`
        CREATE TRIGGER tr_operator_command_audit_immutable
        BEFORE UPDATE OR DELETE ON operator_command_audit_entries
        FOR EACH ROW
        EXECUTE FUNCTION reject_operator_command_audit_mutation()
    `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await database.schema.dropTable("operator_command_audit_entries").execute();
    await sql`DROP FUNCTION reject_operator_command_audit_mutation()`.execute(database);
}
