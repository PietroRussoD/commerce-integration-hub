const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8080;
const MAX_PORT = 65_535;
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;
const ERP_B_SCENARIOS = ["MIXED", "SUCCESS", "POISON_ITEM"] as const;

export type ErpBSimulationScenario = (typeof ERP_B_SCENARIOS)[number];

export interface ProviderSimulatorConfiguration {
    readonly erpBApiToken: string;
    readonly erpBScenario: ErpBSimulationScenario;
    readonly host: string;
    readonly port: number;
}

export function readProviderSimulatorConfiguration(
    environment: Readonly<Record<string, string | undefined>> = process.env
): ProviderSimulatorConfiguration {
    return {
        erpBApiToken: readToken(environment.PROVIDER_SIMULATOR_ERP_B_API_TOKEN),
        erpBScenario: readErpBScenario(environment.PROVIDER_SIMULATOR_ERP_B_SCENARIO),
        host: readHost(environment.HOST),
        port: readPort(environment.PORT)
    };
}

function readErpBScenario(value: string | undefined): ErpBSimulationScenario {
    const scenario = value ?? "MIXED";
    if (!ERP_B_SCENARIOS.some((candidate) => candidate === scenario)) {
        throw new Error(`PROVIDER_SIMULATOR_ERP_B_SCENARIO must be one of: ${ERP_B_SCENARIOS.join(", ")}`);
    }
    return scenario as ErpBSimulationScenario;
}

function readToken(value: string | undefined): string {
    if (value === undefined || value.length > 2_048 || !TOKEN_PATTERN.test(value)) {
        throw new Error(
            "PROVIDER_SIMULATOR_ERP_B_API_TOKEN must be a canonical bearer token of at most 2048 characters"
        );
    }
    return value;
}

function readHost(value: string | undefined): string {
    const host = value ?? DEFAULT_HOST;
    if (host.length === 0 || host.length > 255 || host.trim() !== host) {
        throw new Error("HOST must contain between 1 and 255 non-padded characters");
    }
    return host;
}

function readPort(value: string | undefined): number {
    if (value === undefined) {
        return DEFAULT_PORT;
    }
    if (!/^[1-9][0-9]*$/.test(value)) {
        throw new Error(`PORT must be an integer between 1 and ${MAX_PORT}`);
    }
    const port = Number(value);
    if (!Number.isSafeInteger(port) || port > MAX_PORT) {
        throw new Error(`PORT must be an integer between 1 and ${MAX_PORT}`);
    }
    return port;
}
