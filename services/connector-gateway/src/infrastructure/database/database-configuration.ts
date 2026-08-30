export interface DatabaseConfiguration {
    readonly connectionTimeoutMilliseconds: number;
    readonly connectionString: string;
    readonly maxPoolSize: number;
}

const DEFAULT_CONNECTION_TIMEOUT_MILLISECONDS = 2_000;
const DEFAULT_MAX_POOL_SIZE = 10;
const MAX_CONNECTION_TIMEOUT_MILLISECONDS = 30_000;
const MAX_POOL_SIZE = 50;
const MIN_CONNECTION_TIMEOUT_MILLISECONDS = 100;

export function loadDatabaseConfiguration(
    environment: NodeJS.ProcessEnv = process.env
): DatabaseConfiguration {
    const connectionString = environment.DATABASE_URL?.trim();
    if (connectionString === undefined || connectionString.length === 0) {
        throw new Error("DATABASE_URL must be configured");
    }

    return {
        connectionString,
        connectionTimeoutMilliseconds: readBoundedInteger(
            environment.DATABASE_CONNECTION_TIMEOUT_MILLISECONDS,
            "DATABASE_CONNECTION_TIMEOUT_MILLISECONDS",
            MIN_CONNECTION_TIMEOUT_MILLISECONDS,
            MAX_CONNECTION_TIMEOUT_MILLISECONDS,
            DEFAULT_CONNECTION_TIMEOUT_MILLISECONDS
        ),
        maxPoolSize: readBoundedInteger(
            environment.DATABASE_MAX_POOL_SIZE,
            "DATABASE_MAX_POOL_SIZE",
            1,
            MAX_POOL_SIZE,
            DEFAULT_MAX_POOL_SIZE
        )
    };
}

function readBoundedInteger(
    value: string | undefined,
    name: string,
    minimum: number,
    maximum: number,
    defaultValue: number
): number {
    const trimmed = value?.trim();
    if (trimmed === undefined || trimmed.length === 0) {
        return defaultValue;
    }
    if (!/^\d+$/.test(trimmed)) {
        throw new Error(`${name} must be an integer`);
    }
    const parsed = Number(trimmed);
    if (parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be between ${minimum} and ${maximum}`);
    }
    return parsed;
}
