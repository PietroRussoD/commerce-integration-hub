import { loadDatabaseConfiguration } from "./infrastructure/database/database-configuration.js";
import { createDatabase } from "./infrastructure/database/database.js";
import { migrateToLatest } from "./infrastructure/database/migrator.js";

const database = createDatabase(loadDatabaseConfiguration());

try {
    const results = await migrateToLatest(database);
    for (const result of results) {
        console.info(`${result.status}: ${result.migrationName}`);
    }
} finally {
    await database.destroy();
}
