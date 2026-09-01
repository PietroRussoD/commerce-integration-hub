const DEFAULT_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const DEFAULT_INTERVAL_MILLISECONDS = 30_000;
const DEFAULT_LEASE_DURATION_MILLISECONDS = 60_000;
const DEFAULT_MAX_PAGES_PER_RUN = 10;
const LEASE_HEADROOM_MILLISECONDS = 5_000;
const MAX_INTERVAL_MILLISECONDS = 300_000;
const MAX_LEASE_DURATION_MILLISECONDS = 300_000;
const MAX_PAGES_PER_RUN = 100;
const MAX_WORKER_ID_LENGTH = 100;
const MIN_INTERVAL_MILLISECONDS = 100;
const MIN_LEASE_DURATION_MILLISECONDS = 1_000;
const INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ErpBPollingConfiguration =
    | { readonly enabled: false }
    | {
          readonly connectorId: string;
          readonly enabled: true;
          readonly intervalMilliseconds: number;
          readonly leaseDurationMilliseconds: number;
          readonly maxPagesPerRun: number;
          readonly workerId: string;
      };

export function readErpBPollingConfiguration(
    environment: Readonly<Record<string, string | undefined>> = process.env
): ErpBPollingConfiguration {
    if (!readEnabled(environment.ERP_B_POLLING_ENABLED)) {
        return { enabled: false };
    }

    return {
        connectorId: readConnectorId(environment.ERP_B_CONNECTOR_ID),
        enabled: true,
        intervalMilliseconds: readBoundedInteger(
            environment.ERP_B_POLLING_INTERVAL_MILLISECONDS,
            "ERP_B_POLLING_INTERVAL_MILLISECONDS",
            MIN_INTERVAL_MILLISECONDS,
            MAX_INTERVAL_MILLISECONDS,
            DEFAULT_INTERVAL_MILLISECONDS
        ),
        leaseDurationMilliseconds: readBoundedInteger(
            environment.ERP_B_POLLING_LEASE_DURATION_MILLISECONDS,
            "ERP_B_POLLING_LEASE_DURATION_MILLISECONDS",
            MIN_LEASE_DURATION_MILLISECONDS,
            MAX_LEASE_DURATION_MILLISECONDS,
            DEFAULT_LEASE_DURATION_MILLISECONDS
        ),
        maxPagesPerRun: readBoundedInteger(
            environment.ERP_B_POLLING_MAX_PAGES_PER_RUN,
            "ERP_B_POLLING_MAX_PAGES_PER_RUN",
            1,
            MAX_PAGES_PER_RUN,
            DEFAULT_MAX_PAGES_PER_RUN
        ),
        workerId: readWorkerId(environment.ERP_B_POLLING_WORKER_ID)
    };
}

export function assertPollingLeaseExceedsRequestTimeout(
    leaseDurationMilliseconds: number,
    requestTimeoutMilliseconds: number
): void {
    if (leaseDurationMilliseconds < requestTimeoutMilliseconds + LEASE_HEADROOM_MILLISECONDS) {
        throw new Error(
            "ERP_B_POLLING_LEASE_DURATION_MILLISECONDS must exceed ERP_B_TIMEOUT_MILLISECONDS by at least 5000"
        );
    }
}

function readEnabled(value: string | undefined): boolean {
    if (value === undefined || value === "false") {
        return false;
    }
    if (value === "true") {
        return true;
    }
    throw new Error("ERP_B_POLLING_ENABLED must be true or false");
}

function readConnectorId(value: string | undefined): string {
    const connectorId = value ?? DEFAULT_CONNECTOR_ID;
    if (!UUID_PATTERN.test(connectorId)) {
        throw new Error("ERP_B_CONNECTOR_ID must be a canonical UUID");
    }
    return connectorId;
}

function readWorkerId(value: string | undefined): string {
    if (value === undefined || value.trim().length === 0 || value.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(
            `ERP_B_POLLING_WORKER_ID must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`
        );
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
