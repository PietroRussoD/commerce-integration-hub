import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
    await sql`
        ALTER TABLE inbound_deliveries
        DROP CONSTRAINT ck_inbound_deliveries_status
    `.execute(database);

    await sql`
        UPDATE inbound_deliveries
        SET
            status = CASE status
                WHEN 'SUCCEEDED' THEN 'DELIVERED'
                WHEN 'BLOCKED_AUTH' THEN 'BLOCKED_CONFIGURATION'
                WHEN 'PAYLOAD_CONFLICT' THEN 'PERMANENT_FAILURE'
                ELSE status
            END,
            error_code = CASE status
                WHEN 'BLOCKED_AUTH' THEN COALESCE(error_code, 'CORE_AUTHENTICATION_REJECTED')
                WHEN 'PAYLOAD_CONFLICT' THEN COALESCE(error_code, 'PAYLOAD_CONFLICT')
                ELSE error_code
            END,
            completed_at = CASE
                WHEN status IN (
                    'SUCCEEDED',
                    'PERMANENT_FAILURE',
                    'BLOCKED_AUTH',
                    'BLOCKED_CONFIGURATION',
                    'PAYLOAD_CONFLICT'
                ) THEN COALESCE(completed_at, updated_at)
                ELSE completed_at
            END,
            lease_owner = CASE
                WHEN status IN (
                    'SUCCEEDED',
                    'PERMANENT_FAILURE',
                    'BLOCKED_AUTH',
                    'BLOCKED_CONFIGURATION',
                    'PAYLOAD_CONFLICT'
                ) THEN NULL
                ELSE lease_owner
            END,
            lease_token = CASE
                WHEN status IN (
                    'SUCCEEDED',
                    'PERMANENT_FAILURE',
                    'BLOCKED_AUTH',
                    'BLOCKED_CONFIGURATION',
                    'PAYLOAD_CONFLICT'
                ) THEN NULL
                ELSE lease_token
            END,
            lease_expires_at = CASE
                WHEN status IN (
                    'SUCCEEDED',
                    'PERMANENT_FAILURE',
                    'BLOCKED_AUTH',
                    'BLOCKED_CONFIGURATION',
                    'PAYLOAD_CONFLICT'
                ) THEN NULL
                ELSE lease_expires_at
            END
    `.execute(database);

    await sql`
        ALTER TABLE inbound_deliveries
        ADD CONSTRAINT ck_inbound_deliveries_status CHECK (
            status IN (
                'RECEIVED',
                'FORWARDING',
                'RETRY_WAIT',
                'DELIVERED',
                'PERMANENT_FAILURE',
                'BLOCKED_CONFIGURATION',
                'EXHAUSTED'
            )
        ),
        ADD CONSTRAINT ck_inbound_deliveries_lifecycle CHECK (
            (
                status IN ('RECEIVED', 'RETRY_WAIT')
                AND lease_owner IS NULL
                AND lease_token IS NULL
                AND lease_expires_at IS NULL
                AND completed_at IS NULL
            ) OR (
                status = 'FORWARDING'
                AND lease_owner IS NOT NULL
                AND lease_token IS NOT NULL
                AND lease_expires_at IS NOT NULL
                AND completed_at IS NULL
            ) OR (
                status IN (
                    'DELIVERED',
                    'PERMANENT_FAILURE',
                    'BLOCKED_CONFIGURATION',
                    'EXHAUSTED'
                )
                AND lease_owner IS NULL
                AND lease_token IS NULL
                AND lease_expires_at IS NULL
                AND completed_at IS NOT NULL
            )
        )
    `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await sql`
        ALTER TABLE inbound_deliveries
        DROP CONSTRAINT ck_inbound_deliveries_lifecycle,
        DROP CONSTRAINT ck_inbound_deliveries_status
    `.execute(database);

    await sql`
        UPDATE inbound_deliveries
        SET status = CASE status
            WHEN 'DELIVERED' THEN 'SUCCEEDED'
            WHEN 'EXHAUSTED' THEN 'PERMANENT_FAILURE'
            ELSE status
        END
    `.execute(database);

    await sql`
        ALTER TABLE inbound_deliveries
        ADD CONSTRAINT ck_inbound_deliveries_status CHECK (
            status IN (
                'RECEIVED',
                'FORWARDING',
                'RETRY_WAIT',
                'SUCCEEDED',
                'PERMANENT_FAILURE',
                'BLOCKED_AUTH',
                'BLOCKED_CONFIGURATION',
                'PAYLOAD_CONFLICT'
            )
        )
    `.execute(database);
}
