import { buildApplication } from "./app.js";
import { createReceiveInboundDeliveryUseCase } from "./application/deliveries/receive-inbound-delivery.js";
import { readMarketplaceAConnectorId } from "./connectors/marketplace-a/connector-configuration.js";
import { readMarketplaceAWebhookSecurityConfiguration } from "./connectors/marketplace-a/webhook-security-configuration.js";
import { createConfiguredMarketplaceAWebhookAuthenticator } from "./connectors/marketplace-a/webhook-security.js";
import { loadDatabaseConfiguration } from "./infrastructure/database/database-configuration.js";
import { createDatabase } from "./infrastructure/database/database.js";
import { KyselyInboundDeliveryRepository } from "./infrastructure/database/kysely-inbound-delivery-repository.js";

const DEFAULT_PORT = 8081;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

function readPort(rawPort: string | undefined): number {
    if (rawPort === undefined) {
        return DEFAULT_PORT;
    }

    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
        throw new Error(`PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}`);
    }

    return port;
}

const databaseConfiguration = loadDatabaseConfiguration();
const webhookSecurityConfiguration = readMarketplaceAWebhookSecurityConfiguration(process.env);
const database = createDatabase(databaseConfiguration);
const repository = new KyselyInboundDeliveryRepository(database);
const receiveInboundDelivery = createReceiveInboundDeliveryUseCase({
    connectorId: readMarketplaceAConnectorId(),
    repository
});
const application = buildApplication({
    logger: true,
    marketplaceAWebhook: {
        authenticate: createConfiguredMarketplaceAWebhookAuthenticator(
            webhookSecurityConfiguration
        ),
        receiveInboundDelivery
    }
});

application.addHook("onClose", async () => database.destroy());

async function shutDown(signal: NodeJS.Signals): Promise<void> {
    application.log.info({ signal }, "Shutting down connector gateway");

    try {
        await application.close();
    } catch (error) {
        application.log.error(error, "Failed to shut down connector gateway");
        process.exitCode = 1;
    }
}

process.once("SIGINT", () => void shutDown("SIGINT"));
process.once("SIGTERM", () => void shutDown("SIGTERM"));

try {
    await application.listen({
        host: process.env.HOST ?? "0.0.0.0",
        port: readPort(process.env.PORT)
    });
} catch (error) {
    application.log.error(error);
    process.exitCode = 1;
    await application.close();
}
