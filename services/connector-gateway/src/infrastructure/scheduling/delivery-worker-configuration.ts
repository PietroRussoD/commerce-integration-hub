const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_INTERVAL_MILLISECONDS = 2_000;
const DEFAULT_LEASE_DURATION_MILLISECONDS = 60_000;
const MAX_BATCH_SIZE = 100;
const MAX_INTERVAL_MILLISECONDS = 60_000;
const MAX_LEASE_DURATION_MILLISECONDS = 300_000;
const MAX_WORKER_ID_LENGTH = 100;
const MIN_INTERVAL_MILLISECONDS = 100;
const MIN_LEASE_DURATION_MILLISECONDS = 1_000;
const INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;

export type DeliveryWorkerConfiguration =
    | { readonly enabled: false }
    | {
          readonly batchSize: number;
          readonly enabled: true;
          readonly intervalMilliseconds: number;
          readonly leaseDurationMilliseconds: number;
          readonly workerId: string;
      };

export function readDeliveryWorkerConfiguration(
    environment: Readonly<Record<string, string | undefined>> = process.env
): DeliveryWorkerConfiguration {
    const enabled = readEnabled(environment.DELIVERY_WORKER_ENABLED);
    if (!enabled) {
        return { enabled: false };
    }

    return {
        batchSize: readBoundedInteger(
            environment.DELIVERY_WORKER_BATCH_SIZE,
            "DELIVERY_WORKER_BATCH_SIZE",
            1,
            MAX_BATCH_SIZE,
            DEFAULT_BATCH_SIZE
        ),
        enabled: true,
        intervalMilliseconds: readBoundedInteger(
            environment.DELIVERY_WORKER_INTERVAL_MILLISECONDS,
            "DELIVERY_WORKER_INTERVAL_MILLISECONDS",
            MIN_INTERVAL_MILLISECONDS,
            MAX_INTERVAL_MILLISECONDS,
            DEFAULT_INTERVAL_MILLISECONDS
        ),
        leaseDurationMilliseconds: readBoundedInteger(
            environment.DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS,
            "DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS",
            MIN_LEASE_DURATION_MILLISECONDS,
            MAX_LEASE_DURATION_MILLISECONDS,
            DEFAULT_LEASE_DURATION_MILLISECONDS
        ),
        workerId: readWorkerId(environment.DELIVERY_WORKER_ID)
    };
}

export function assertLeaseExceedsForwardingTimeout(
    leaseDurationMilliseconds: number,
    forwardingTimeoutMilliseconds: number
): void {
    if (leaseDurationMilliseconds <= forwardingTimeoutMilliseconds) {
        throw new Error(
            "DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS must exceed INTEGRATION_CORE_TIMEOUT_MILLISECONDS"
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
    throw new Error("DELIVERY_WORKER_ENABLED must be true or false");
}

function readWorkerId(value: string | undefined): string {
    if (value === undefined || value.trim().length === 0 || value.length > MAX_WORKER_ID_LENGTH) {
        throw new Error(
            `DELIVERY_WORKER_ID must contain between 1 and ${MAX_WORKER_ID_LENGTH} characters`
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
