import { buildApplication } from "./app.js";

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

const application = buildApplication({ logger: true });

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
}
