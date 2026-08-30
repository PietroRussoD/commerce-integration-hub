import type { Kysely } from "kysely";
import { Migrator, type Migration, type MigrationProvider, type MigrationResult } from "kysely/migration";

import type { GatewayDatabase } from "./database.js";
import * as createDeliveryLedger from "./migrations/001_create_delivery_ledger.js";
import * as seedMarketplaceAConnector from "./migrations/002_seed_marketplace_a_connector.js";
import * as addDeliveryLeaseToken from "./migrations/003_add_delivery_lease_token.js";
import * as createDeliveryAttempts from "./migrations/004_create_delivery_attempts.js";

const migrations: Record<string, Migration> = {
    "001_create_delivery_ledger": createDeliveryLedger,
    "002_seed_marketplace_a_connector": seedMarketplaceAConnector,
    "003_add_delivery_lease_token": addDeliveryLeaseToken,
    "004_create_delivery_attempts": createDeliveryAttempts
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
