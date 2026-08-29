export interface DatabaseConfiguration {
    readonly connectionString: string;
    readonly maxPoolSize: number;
}

const DEFAULT_MAX_POOL_SIZE = 10;
const MAX_POOL_SIZE = 50;

export function loadDatabaseConfiguration(
    environment: NodeJS.ProcessEnv = process.env
): DatabaseConfiguration {
    const connectionString = environment.DATABASE_URL?.trim();
    if (connectionString === undefined || connectionString.length === 0) {
        throw new Error("DATABASE_URL must be configured");
    }

    const configuredPoolSize = environment.DATABASE_MAX_POOL_SIZE?.trim();
    if (configuredPoolSize === undefined || configuredPoolSize.length === 0) {
        return { connectionString, maxPoolSize: DEFAULT_MAX_POOL_SIZE };
    }

    if (!/^\d+$/.test(configuredPoolSize)) {
        throw new Error("DATABASE_MAX_POOL_SIZE must be an integer");
    }

    const maxPoolSize = Number(configuredPoolSize);
    if (maxPoolSize < 1 || maxPoolSize > MAX_POOL_SIZE) {
        throw new Error(`DATABASE_MAX_POOL_SIZE must be between 1 and ${MAX_POOL_SIZE}`);
    }

    return { connectionString, maxPoolSize };
}
