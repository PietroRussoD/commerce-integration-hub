const DEFAULT_RETRY_AFTER_CAP_MILLISECONDS = 900_000;
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000;
const MAX_RETRY_AFTER_CAP_MILLISECONDS = 3_600_000;
const MAX_TIMEOUT_MILLISECONDS = 30_000;
const MIN_TIMEOUT_MILLISECONDS = 100;
const INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const SOURCE_API_KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface IntegrationCoreClientConfiguration {
    readonly baseUrl: string;
    readonly retryAfterCapMilliseconds: number;
    readonly sourceApiKey: string;
    readonly timeoutMilliseconds: number;
}

export function readIntegrationCoreClientConfiguration(
    environment: Readonly<Record<string, string | undefined>> = process.env
): IntegrationCoreClientConfiguration {
    return {
        baseUrl: readBaseUrl(environment.INTEGRATION_CORE_BASE_URL),
        retryAfterCapMilliseconds: readBoundedInteger(
            environment.INTEGRATION_CORE_RETRY_AFTER_CAP_MILLISECONDS,
            "INTEGRATION_CORE_RETRY_AFTER_CAP_MILLISECONDS",
            0,
            MAX_RETRY_AFTER_CAP_MILLISECONDS,
            DEFAULT_RETRY_AFTER_CAP_MILLISECONDS
        ),
        sourceApiKey: readSourceApiKey(environment.INTEGRATION_CORE_SOURCE_API_KEY),
        timeoutMilliseconds: readBoundedInteger(
            environment.INTEGRATION_CORE_TIMEOUT_MILLISECONDS,
            "INTEGRATION_CORE_TIMEOUT_MILLISECONDS",
            MIN_TIMEOUT_MILLISECONDS,
            MAX_TIMEOUT_MILLISECONDS,
            DEFAULT_TIMEOUT_MILLISECONDS
        )
    };
}

function readBaseUrl(value: string | undefined): string {
    if (value === undefined || value.length === 0) {
        throw new Error("INTEGRATION_CORE_BASE_URL is required");
    }

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("INTEGRATION_CORE_BASE_URL must be an absolute HTTP(S) URL");
    }

    if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username.length > 0 ||
        url.password.length > 0 ||
        url.pathname !== "/" ||
        url.search.length > 0 ||
        url.hash.length > 0
    ) {
        throw new Error(
            "INTEGRATION_CORE_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment"
        );
    }
    return url.origin;
}

function readSourceApiKey(value: string | undefined): string {
    if (value === undefined || !SOURCE_API_KEY_PATTERN.test(value)) {
        throw new Error("INTEGRATION_CORE_SOURCE_API_KEY must be a canonical source API key");
    }
    return value;
}

function readBoundedInteger(
    value: string | undefined,
    name: string,
    minimum: number,
    maximum: number,
    defaultValue: number
): number {
    if (value === undefined) {
        return defaultValue;
    }
    if (!INTEGER_PATTERN.test(value)) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
}
