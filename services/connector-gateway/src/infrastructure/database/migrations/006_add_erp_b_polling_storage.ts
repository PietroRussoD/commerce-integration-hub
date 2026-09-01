import { sql, type Kysely } from "kysely";

const ERP_B_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";

export async function up(database: Kysely<unknown>): Promise<void> {
    await sql`
        ALTER TABLE inbound_deliveries
        ALTER COLUMN canonical_payload DROP NOT NULL,
        ADD CONSTRAINT ck_inbound_deliveries_canonical_payload CHECK (
            canonical_payload IS NOT NULL
            OR (
                status = 'PERMANENT_FAILURE'
                AND error_code IS NOT NULL
                AND error_code IN (
                    'ERP_B_DUPLICATE_POSITION_ID',
                    'ERP_B_INVALID_IDENTIFIER',
                    'ERP_B_NON_POSITIVE_QUANTITY',
                    'ERP_B_TOTAL_MISMATCH',
                    'ERP_B_UNSUPPORTED_CURRENCY'
                )
            )
        )
    `.execute(database);

    await database.schema
        .createTable("polling_checkpoints")
        .addColumn("connector_id", "uuid", (column) =>
            column
                .primaryKey()
                .references("connector_configurations.id")
                .onDelete("restrict")
        )
        .addColumn("cursor", "varchar(512)")
        .addColumn("version", "integer", (column) => column.notNull().defaultTo(1))
        .addColumn("lease_owner", "varchar(100)")
        .addColumn("lease_token", "uuid")
        .addColumn("lease_expires_at", "timestamptz")
        .addColumn("last_polled_at", "timestamptz")
        .addColumn("last_successful_poll_at", "timestamptz")
        .addColumn("created_at", "timestamptz", (column) =>
            column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
        )
        .addColumn("updated_at", "timestamptz", (column) =>
            column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
        )
        .addCheckConstraint(
            "ck_polling_checkpoints_cursor",
            sql`cursor IS NULL OR (cursor <> '' AND cursor !~ '^[[:space:]]*$')`
        )
        .addCheckConstraint("ck_polling_checkpoints_version", sql`version > 0`)
        .addCheckConstraint(
            "ck_polling_checkpoints_lease",
            sql`(
                lease_owner IS NULL
                AND lease_token IS NULL
                AND lease_expires_at IS NULL
            ) OR (
                lease_owner IS NOT NULL
                AND lease_owner <> ''
                AND lease_owner !~ '^[[:space:]]*$'
                AND lease_token IS NOT NULL
                AND lease_expires_at IS NOT NULL
                AND lease_expires_at > updated_at
            )`
        )
        .addCheckConstraint(
            "ck_polling_checkpoints_success_time",
            sql`last_successful_poll_at IS NULL OR (
                last_polled_at IS NOT NULL
                AND last_successful_poll_at <= last_polled_at
            )`
        )
        .execute();

    await sql`
        INSERT INTO connector_configurations (
            id,
            provider,
            source_system,
            mode,
            status,
            schedule,
            secret_reference
        ) VALUES (
            ${ERP_B_CONNECTOR_ID}::uuid,
            'ERP_B',
            'ERP_B',
            'POLLING',
            'ACTIVE',
            'interval:PT30S',
            'env:ERP_B_API_TOKEN'
        )
    `.execute(database);

    await sql`
        INSERT INTO polling_checkpoints (connector_id)
        VALUES (${ERP_B_CONNECTOR_ID}::uuid)
    `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await database.schema.dropTable("polling_checkpoints").execute();

    await sql`
        DELETE FROM connector_configurations
        WHERE id = ${ERP_B_CONNECTOR_ID}::uuid
    `.execute(database);

    await sql`
        ALTER TABLE inbound_deliveries
        DROP CONSTRAINT ck_inbound_deliveries_canonical_payload,
        ALTER COLUMN canonical_payload SET NOT NULL
    `.execute(database);
}
