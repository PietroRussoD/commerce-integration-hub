const DEFAULT_CLOCK_TOLERANCE_SECONDS = 30;
const MAX_CLOCK_TOLERANCE_SECONDS = 300;
const MAX_AUDIENCE_LENGTH = 200;
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;

export type OperatorSecurityConfiguration =
    | {
          readonly authorizationEnabled: false;
          readonly oidcEnabled: false;
      }
    | {
          readonly audience: string;
          readonly authorizationEnabled: boolean;
          readonly clockToleranceSeconds: number;
          readonly issuer: string;
          readonly jwksUrl: URL;
          readonly oidcEnabled: true;
      };

export function readOperatorSecurityConfiguration(
    environment: Readonly<Record<string, string | undefined>> = process.env
): OperatorSecurityConfiguration {
    const oidcEnabled = readBoolean(environment.OPERATOR_OIDC_ENABLED, "OPERATOR_OIDC_ENABLED");
    const authorizationEnabled = readBoolean(
        environment.OPERATOR_AUTHORIZATION_ENABLED,
        "OPERATOR_AUTHORIZATION_ENABLED"
    );

    if (!oidcEnabled) {
        if (authorizationEnabled) {
            throw new Error(
                "OPERATOR_AUTHORIZATION_ENABLED requires OPERATOR_OIDC_ENABLED=true"
            );
        }
        return { authorizationEnabled: false, oidcEnabled: false };
    }

    return {
        audience: readAudience(environment.OPERATOR_OIDC_AUDIENCE),
        authorizationEnabled,
        clockToleranceSeconds: readClockTolerance(
            environment.OPERATOR_OIDC_CLOCK_SKEW_SECONDS
        ),
        issuer: readIssuer(environment.OPERATOR_OIDC_ISSUER),
        jwksUrl: readJwksUrl(environment.OPERATOR_OIDC_JWKS_URL),
        oidcEnabled: true
    };
}

function readBoolean(value: string | undefined, name: string): boolean {
    if (value === undefined || value === "false") {
        return false;
    }
    if (value === "true") {
        return true;
    }
    throw new Error(`${name} must be true or false`);
}

function readAudience(value: string | undefined): string {
    if (
        value === undefined ||
        value.length === 0 ||
        value.length > MAX_AUDIENCE_LENGTH ||
        value !== value.trim()
    ) {
        throw new Error(
            `OPERATOR_OIDC_AUDIENCE must contain between 1 and ${MAX_AUDIENCE_LENGTH} characters without surrounding whitespace`
        );
    }
    return value;
}

function readIssuer(value: string | undefined): string {
    const issuer = value ?? "";
    readHttpUrl(issuer, "OPERATOR_OIDC_ISSUER");
    return issuer;
}

function readJwksUrl(value: string | undefined): URL {
    return readHttpUrl(value, "OPERATOR_OIDC_JWKS_URL");
}

function readHttpUrl(value: string | undefined, name: string): URL {
    if (value === undefined || value.length === 0 || value !== value.trim()) {
        throw new Error(`${name} must be an absolute HTTP(S) URL`);
    }

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${name} must be an absolute HTTP(S) URL`);
    }
    if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username.length > 0 ||
        url.password.length > 0 ||
        url.search.length > 0 ||
        url.hash.length > 0
    ) {
        throw new Error(`${name} must be an HTTP(S) URL without credentials, query, or fragment`);
    }
    return url;
}

function readClockTolerance(value: string | undefined): number {
    if (value === undefined) {
        return DEFAULT_CLOCK_TOLERANCE_SECONDS;
    }
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(value)) {
        throw new Error(
            `OPERATOR_OIDC_CLOCK_SKEW_SECONDS must be an integer between 0 and ${MAX_CLOCK_TOLERANCE_SECONDS}`
        );
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > MAX_CLOCK_TOLERANCE_SECONDS) {
        throw new Error(
            `OPERATOR_OIDC_CLOCK_SKEW_SECONDS must be an integer between 0 and ${MAX_CLOCK_TOLERANCE_SECONDS}`
        );
    }
    return parsed;
}
