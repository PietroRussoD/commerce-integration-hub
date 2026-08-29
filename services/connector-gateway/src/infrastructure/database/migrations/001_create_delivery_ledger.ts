import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    await database.schema
        .createTable("connector_configurations")
        .addColumn("id", "uuid", (column) => column.primaryKey())
        .addColumn("provider", "varchar(50)", (column) => column.notNull())
        .addColumn("source_system", "varchar(50)", (column) => column.notNull())
        .addColumn("mode", "varchar(20)", (column) => column.notNull())
        .addColumn("status", "varchar(30)", (column) => column.notNull())
        .addColumn("schedule", "varchar(100)")
        .addColumn("secret_reference", "varchar(300)", (column) => column.notNull())
        .addColumn("version", "integer", (column) => column.notNull().defaultTo(1))
        .addColumn("created_at", "timestamptz", (column) =>
            column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
        )
        .addColumn("updated_at", "timestamptz", (column) =>
            column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
        )
        .addCheckConstraint(
            "ck_connector_configurations_provider",
            sql`provider IN ('MARKETPLACE_A', 'ERP_B')`
        )
        .addCheckConstraint(
            "ck_connector_configurations_mode",
            sql`mode IN ('WEBHOOK', 'POLLING')`
        )
        .addCheckConstraint(
            "ck_connector_configurations_status",
            sql`status IN ('ACTIVE', 'DISABLED', 'BLOCKED_CONFIGURATION')`
        )
        .addCheckConstraint(
            "ck_connector_configurations_schedule",
            sql`(mode = 'WEBHOOK' AND schedule IS NULL) OR (mode = 'POLLING' AND schedule IS NOT NULL)`
        )
        .addCheckConstraint("ck_connector_configurations_version", sql`version > 0`)
        .execute();

    await database.schema
        .createTable("inbound_deliveries")
        .addColumn("id", "uuid", (column) => column.primaryKey())
        .addColumn("connector_id", "uuid", (column) =>
            column
                .notNull()
                .references("connector_configurations.id")
                .onDelete("restrict")
        )
        .addColumn("external_event_id", "varchar(150)", (column) => column.notNull())
        .addColumn("provider_payload_hash", "char(64)", (column) => column.notNull())
        .addColumn("raw_payload", "jsonb", (column) => column.notNull())
        .addColumn("canonical_payload", "jsonb", (column) => column.notNull())
        .addColumn("mapping_version", "varchar(100)", (column) => column.notNull())
        .addColumn("status", "varchar(40)", (column) => column.notNull().defaultTo("RECEIVED"))
        .addColumn("attempt_count", "integer", (column) => column.notNull().defaultTo(0))
        .addColumn("next_attempt_at", "timestamptz", (column) =>
            column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
        )
        .addColumn("lease_owner", "varchar(100)")
        .addColumn("lease_expires_at", "timestamptz")
        .addColumn("error_code", "varchar(100)")
        .addColumn("safe_error_message", "varchar(500)")
        .addColumn("last_http_status", "smallint")
        .addColumn("correlation_id", "uuid")
        .addColumn("last_core_order_id", "uuid")
        .addColumn("received_at", "timestamptz", (column) =>
            column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
        )
        .addColumn("updated_at", "timestamptz", (column) =>
            column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
        )
        .addColumn("completed_at", "timestamptz")
        .addColumn("payload_expires_at", "timestamptz", (column) =>
            column.notNull().defaultTo(sql`CURRENT_TIMESTAMP + INTERVAL '30 days'`)
        )
        .addUniqueConstraint("uk_inbound_deliveries_connector_event", [
            "connector_id",
            "external_event_id"
        ])
        .addCheckConstraint(
            "ck_inbound_deliveries_hash",
            sql`provider_payload_hash ~ '^[0-9a-f]{64}$'`
        )
        .addCheckConstraint(
            "ck_inbound_deliveries_json_objects",
            sql`jsonb_typeof(raw_payload) = 'object' AND jsonb_typeof(canonical_payload) = 'object'`
        )
        .addCheckConstraint(
            "ck_inbound_deliveries_status",
            sql`status IN (
                'RECEIVED',
                'FORWARDING',
                'RETRY_WAIT',
                'SUCCEEDED',
                'PERMANENT_FAILURE',
                'BLOCKED_AUTH',
                'BLOCKED_CONFIGURATION',
                'PAYLOAD_CONFLICT'
            )`
        )
        .addCheckConstraint("ck_inbound_deliveries_attempt_count", sql`attempt_count >= 0`)
        .addCheckConstraint(
            "ck_inbound_deliveries_lease",
            sql`(lease_owner IS NULL) = (lease_expires_at IS NULL)`
        )
        .addCheckConstraint(
            "ck_inbound_deliveries_http_status",
            sql`last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599`
        )
        .execute();

    await database.schema
        .createIndex("ix_inbound_deliveries_dispatch_eligibility")
        .on("inbound_deliveries")
        .columns(["next_attempt_at", "received_at"])
        .where(sql.ref("status"), "in", ["RECEIVED", "RETRY_WAIT"])
        .execute();

    await database.schema
        .createIndex("ix_inbound_deliveries_status_received")
        .on("inbound_deliveries")
        .columns(["status", "received_at"])
        .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await database.schema.dropTable("inbound_deliveries").execute();
    await database.schema.dropTable("connector_configurations").execute();
}
