const DEFAULT_CONNECTOR_ID = "0199037b-6400-7000-8000-000000000001";
const CONNECTOR_ID_ENVIRONMENT_VARIABLE = "MARKETPLACE_A_CONNECTOR_ID";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readMarketplaceAConnectorId(
    environment: Readonly<Record<string, string | undefined>> = process.env
): string {
    const connectorId = environment[CONNECTOR_ID_ENVIRONMENT_VARIABLE] ?? DEFAULT_CONNECTOR_ID;
    if (!UUID_PATTERN.test(connectorId)) {
        throw new Error(`${CONNECTOR_ID_ENVIRONMENT_VARIABLE} must be a canonical UUID`);
    }
    return connectorId;
}
