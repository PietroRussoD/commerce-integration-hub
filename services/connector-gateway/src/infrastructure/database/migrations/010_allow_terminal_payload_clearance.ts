import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    // Explicit SQL-null guards matter: PostgreSQL accepts a CHECK whose result
    // is UNKNOWN. JSON null is not an absent SQL payload and must still fail.
    await sql`
        ALTER TABLE inbound_deliveries
        ALTER COLUMN raw_payload DROP NOT NULL,
        ADD COLUMN payload_cleared_at timestamptz,
        DROP CONSTRAINT ck_inbound_deliveries_json_objects,
        DROP CONSTRAINT ck_inbound_deliveries_canonical_payload,
        ADD CONSTRAINT ck_inbound_deliveries_payload_retention CHECK (
            (
                payload_cleared_at IS NULL
                AND raw_payload IS NOT NULL
                AND jsonb_typeof(raw_payload) = 'object'
                AND (
                    (
                        canonical_payload IS NOT NULL
                        AND jsonb_typeof(canonical_payload) = 'object'
                    ) OR (
                        canonical_payload IS NULL
                        AND status = 'PERMANENT_FAILURE'
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
            ) OR (
                payload_cleared_at IS NOT NULL
                AND raw_payload IS NULL
                AND canonical_payload IS NULL
                AND status IN (
                    'DELIVERED',
                    'PERMANENT_FAILURE',
                    'BLOCKED_CONFIGURATION',
                    'EXHAUSTED'
                )
                AND payload_cleared_at >= payload_expires_at
                AND completed_at IS NOT NULL
                AND payload_cleared_at >= completed_at
            )
        )
    `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
    // One atomic ALTER restores the previous schema only if no raw payload was
    // cleared. A failed rollback neither removes the marker nor fabricates data.
    await sql`
        ALTER TABLE inbound_deliveries
        ALTER COLUMN raw_payload SET NOT NULL,
        DROP CONSTRAINT ck_inbound_deliveries_payload_retention,
        DROP COLUMN payload_cleared_at,
        ADD CONSTRAINT ck_inbound_deliveries_json_objects CHECK (
            jsonb_typeof(raw_payload) = 'object'
            AND jsonb_typeof(canonical_payload) = 'object'
        ),
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
}
