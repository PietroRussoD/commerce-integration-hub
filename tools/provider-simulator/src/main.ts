import { buildProviderSimulator } from "./app.js";
import { readProviderSimulatorConfiguration } from "./configuration.js";

const configuration = readProviderSimulatorConfiguration();
const application = buildProviderSimulator({
    erpBApiToken: configuration.erpBApiToken,
    erpBScenario: configuration.erpBScenario,
    logger: true
});

async function shutDown(signal: NodeJS.Signals): Promise<void> {
    application.log.info({ signal }, "Shutting down provider simulator");
    try {
        await application.close();
    } catch (error) {
        application.log.error(error, "Failed to shut down provider simulator");
        process.exitCode = 1;
    }
}

process.once("SIGINT", () => void shutDown("SIGINT"));
process.once("SIGTERM", () => void shutDown("SIGTERM"));

try {
    await application.listen({ host: configuration.host, port: configuration.port });
} catch (error) {
    application.log.error(error);
    process.exitCode = 1;
    await application.close();
}
