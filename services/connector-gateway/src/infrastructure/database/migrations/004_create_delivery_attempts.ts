import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    await database.schema
        .createTable("delivery_attempts")
        .addColumn("id", "uuid", (column) => column.primaryKey())
        .addColumn("delivery_id", "uuid", (column) =>
            column
                .notNull()
                .references("inbound_deliveries.id")
                .onDelete("restrict")
        )
        .addColumn("attempt_number", "integer", (column) => column.notNull())
        .addColumn("started_at", "timestamptz", (column) => column.notNull())
        .addColumn("completed_at", "timestamptz")
        .addColumn("outcome", "varchar(40)")
        .addColumn("http_status", "smallint")
        .addColumn("error_code", "varchar(100)")
        .addColumn("safe_error_message", "varchar(500)")
        .addColumn("duration_ms", "integer")
        .addColumn("trace_id", "char(32)")
        .addUniqueConstraint("uk_delivery_attempts_delivery_number", [
            "delivery_id",
            "attempt_number"
        ])
        .addCheckConstraint("ck_delivery_attempts_number", sql`attempt_number > 0`)
        .addCheckConstraint(
            "ck_delivery_attempts_outcome",
            sql`outcome IS NULL OR outcome IN (
                'DELIVERED',
                'BLOCKED_CONFIGURATION',
                'PERMANENT_FAILURE',
                'RETRYABLE_FAILURE'
            )`
        )
        .addCheckConstraint(
            "ck_delivery_attempts_http_status",
            sql`http_status IS NULL OR http_status BETWEEN 100 AND 599`
        )
        .addCheckConstraint(
            "ck_delivery_attempts_duration",
            sql`duration_ms IS NULL OR duration_ms >= 0`
        )
        .addCheckConstraint(
            "ck_delivery_attempts_trace_id",
            sql`trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'`
        )
        .addCheckConstraint(
            "ck_delivery_attempts_lifecycle",
            sql`(
                completed_at IS NULL
                AND outcome IS NULL
                AND http_status IS NULL
                AND error_code IS NULL
                AND safe_error_message IS NULL
                AND duration_ms IS NULL
            ) OR (
                completed_at IS NOT NULL
                AND completed_at >= started_at
                AND outcome IS NOT NULL
                AND duration_ms IS NOT NULL
                AND (
                    (
                        outcome = 'DELIVERED'
                        AND http_status IS NOT NULL
                        AND http_status IN (200, 201)
                        AND error_code IS NULL
                        AND safe_error_message IS NULL
                    )
                    OR (outcome <> 'DELIVERED' AND error_code IS NOT NULL)
                )
            )`
        )
        .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await database.schema.dropTable("delivery_attempts").execute();
}
