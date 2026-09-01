const DEFAULT_MAX_RESPONSE_BYTES = 8_388_608;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_RETRY_AFTER_CAP_MILLISECONDS = 900_000;
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000;
const MAX_MAX_RESPONSE_BYTES = 33_554_432;
const MAX_RETRY_AFTER_CAP_MILLISECONDS = 3_600_000;
const MAX_TIMEOUT_MILLISECONDS = 30_000;
const MIN_MAX_RESPONSE_BYTES = 1_024;
const MIN_TIMEOUT_MILLISECONDS = 100;
const INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;

export interface ErpBClientConfiguration {
    readonly apiToken: string;
    readonly baseUrl: string;
    readonly maxResponseBytes: number;
    readonly pageLimit: number;
    readonly retryAfterCapMilliseconds: number;
    readonly timeoutMilliseconds: number;
}

export function readErpBClientConfiguration(
    environment: Readonly<Record<string, string | undefined>> = process.env
): ErpBClientConfiguration {
    return {
        apiToken: readApiToken(environment.ERP_B_API_TOKEN),
        baseUrl: readBaseUrl(environment.ERP_B_BASE_URL),
        maxResponseBytes: readBoundedInteger(
            environment.ERP_B_MAX_RESPONSE_BYTES,
            "ERP_B_MAX_RESPONSE_BYTES",
            MIN_MAX_RESPONSE_BYTES,
            MAX_MAX_RESPONSE_BYTES,
            DEFAULT_MAX_RESPONSE_BYTES
        ),
        pageLimit: readBoundedInteger(
            environment.ERP_B_PAGE_LIMIT,
            "ERP_B_PAGE_LIMIT",
            1,
            100,
            DEFAULT_PAGE_LIMIT
        ),
        retryAfterCapMilliseconds: readBoundedInteger(
            environment.ERP_B_RETRY_AFTER_CAP_MILLISECONDS,
            "ERP_B_RETRY_AFTER_CAP_MILLISECONDS",
            0,
            MAX_RETRY_AFTER_CAP_MILLISECONDS,
            DEFAULT_RETRY_AFTER_CAP_MILLISECONDS
        ),
        timeoutMilliseconds: readBoundedInteger(
            environment.ERP_B_TIMEOUT_MILLISECONDS,
            "ERP_B_TIMEOUT_MILLISECONDS",
            MIN_TIMEOUT_MILLISECONDS,
            MAX_TIMEOUT_MILLISECONDS,
            DEFAULT_TIMEOUT_MILLISECONDS
        )
    };
}

function readApiToken(value: string | undefined): string {
    if (
        value === undefined ||
        value.length > 2_048 ||
        !BEARER_TOKEN_PATTERN.test(value)
    ) {
        throw new Error("ERP_B_API_TOKEN must be a canonical bearer token of at most 2048 characters");
    }
    return value;
}

function readBaseUrl(value: string | undefined): string {
    if (value === undefined || value.length === 0) {
        throw new Error("ERP_B_BASE_URL is required");
    }

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("ERP_B_BASE_URL must be an absolute HTTP(S) URL");
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
            "ERP_B_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment"
        );
    }
    return url.origin;
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
