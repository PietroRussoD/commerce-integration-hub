import { sql, type Kysely } from "kysely";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000001";

export async function up(database: Kysely<unknown>): Promise<void> {
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
            ${CONNECTOR_ID}::uuid,
            'MARKETPLACE_A',
            'MARKETPLACE_A',
            'WEBHOOK',
            'ACTIVE',
            NULL,
            'env:MARKETPLACE_A_WEBHOOK_CURRENT_SECRET_BASE64'
        )
    `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
    await sql`
        DELETE FROM connector_configurations
        WHERE id = ${CONNECTOR_ID}::uuid
    `.execute(database);
}
