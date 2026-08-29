import type { Kysely } from "kysely";
import { Migrator, type Migration, type MigrationProvider, type MigrationResult } from "kysely/migration";

import type { GatewayDatabase } from "./database.js";
import * as createDeliveryLedger from "./migrations/001_create_delivery_ledger.js";

const migrations: Record<string, Migration> = {
    "001_create_delivery_ledger": createDeliveryLedger
};

const migrationProvider: MigrationProvider = {
    getMigrations: () => Promise.resolve(migrations)
};

export async function migrateToLatest(
    database: Kysely<GatewayDatabase>
): Promise<readonly MigrationResult[]> {
    const { error, results = [] } = await new Migrator({
        db: database,
        provider: migrationProvider
    }).migrateToLatest();

    if (error !== undefined) {
        throw new Error("Failed to migrate the connector gateway database", { cause: error });
    }

    return results;
}
