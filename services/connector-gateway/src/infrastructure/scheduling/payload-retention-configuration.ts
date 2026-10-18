export type PayloadRetentionConfiguration =
    | { readonly enabled: false }
    | { readonly enabled: true; readonly batchSize: number; readonly intervalMilliseconds: number };

export function readPayloadRetentionConfiguration(
    environment: Readonly<Record<string, string | undefined>> = process.env
): PayloadRetentionConfiguration {
    const enabled = environment.PAYLOAD_RETENTION_ENABLED;
    if (enabled === undefined || enabled === "false") return { enabled: false };
    if (enabled !== "true") throw new Error("PAYLOAD_RETENTION_ENABLED must be true or false");
    return {
        enabled: true,
        batchSize: readInteger(environment.PAYLOAD_RETENTION_BATCH_SIZE, "PAYLOAD_RETENTION_BATCH_SIZE", 1, 100, 50),
        intervalMilliseconds: readInteger(environment.PAYLOAD_RETENTION_INTERVAL_MILLISECONDS,
            "PAYLOAD_RETENTION_INTERVAL_MILLISECONDS", 100, 86_400_000, 60_000)
    };
}

function readInteger(value: string | undefined, name: string, minimum: number, maximum: number, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
}
