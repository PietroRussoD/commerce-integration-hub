import { randomUUID } from "node:crypto";

import { buildApplication } from "./app.js";
import { createClaimInboundDeliveriesUseCase } from "./application/deliveries/claim-inbound-deliveries.js";
import { createCompleteDeliveredInboundDeliveryAttemptUseCase } from "./application/deliveries/complete-delivered-inbound-delivery-attempt.js";
import { createCompleteRetryableInboundDeliveryAttemptUseCase } from "./application/deliveries/complete-retryable-inbound-delivery-attempt.js";
import { createCompleteTerminalInboundDeliveryAttemptUseCase } from "./application/deliveries/complete-terminal-inbound-delivery-attempt.js";
import { createProcessInboundDeliveryBatchUseCase } from "./application/deliveries/process-inbound-delivery-batch.js";
import { createReceiveInboundDeliveryUseCase } from "./application/deliveries/receive-inbound-delivery.js";
import { createRecoverExpiredInboundDeliveriesUseCase } from "./application/deliveries/recover-expired-inbound-deliveries.js";
import { createStartInboundDeliveryAttemptUseCase } from "./application/deliveries/start-inbound-delivery-attempt.js";
import { readMarketplaceAConnectorId } from "./connectors/marketplace-a/connector-configuration.js";
import { readMarketplaceAWebhookSecurityConfiguration } from "./connectors/marketplace-a/webhook-security-configuration.js";
import { createConfiguredMarketplaceAWebhookAuthenticator } from "./connectors/marketplace-a/webhook-security.js";
import { loadDatabaseConfiguration } from "./infrastructure/database/database-configuration.js";
import { createDatabase } from "./infrastructure/database/database.js";
import { KyselyInboundDeliveryAttemptRepository } from "./infrastructure/database/kysely-inbound-delivery-attempt-repository.js";
import { KyselyInboundDeliveryClaimRepository } from "./infrastructure/database/kysely-inbound-delivery-claim-repository.js";
import { KyselyInboundDeliveryRepository } from "./infrastructure/database/kysely-inbound-delivery-repository.js";
import { KyselyDatabaseReadiness } from "./infrastructure/database/kysely-database-readiness.js";
import { FetchIntegrationCoreOrderClient } from "./infrastructure/http/fetch-integration-core-order-client.js";
import { readIntegrationCoreClientConfiguration } from "./infrastructure/http/integration-core-client-configuration.js";
import { createConnectorGatewayMetrics } from "./infrastructure/observability/delivery-worker-metrics.js";
import {
    assertLeaseExceedsForwardingTimeout,
    readDeliveryWorkerConfiguration
} from "./infrastructure/scheduling/delivery-worker-configuration.js";
import {
    createDeliveryWorkerScheduler,
    type DeliveryWorkerScheduler
} from "./infrastructure/scheduling/delivery-worker-scheduler.js";

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
const deliveryWorkerConfiguration = readDeliveryWorkerConfiguration(process.env);
const database = createDatabase(databaseConfiguration);
const metrics = createConnectorGatewayMetrics();
const databaseReadiness = new KyselyDatabaseReadiness(database);
const deliveryRepository = new KyselyInboundDeliveryRepository(database);
const receiveInboundDelivery = createReceiveInboundDeliveryUseCase({
    connectorId: readMarketplaceAConnectorId(),
    repository: deliveryRepository
});
const application = buildApplication({
    logger: true,
    marketplaceAWebhook: {
        authenticate: createConfiguredMarketplaceAWebhookAuthenticator(
            webhookSecurityConfiguration
        ),
        receiveInboundDelivery
    },
    metrics: metrics.exporter,
    readiness: () => databaseReadiness.isReady()
});
let deliveryWorker: DeliveryWorkerScheduler | undefined;

if (deliveryWorkerConfiguration.enabled) {
    const coreClientConfiguration = readIntegrationCoreClientConfiguration(process.env);
    assertLeaseExceedsForwardingTimeout(
        deliveryWorkerConfiguration.leaseDurationMilliseconds,
        coreClientConfiguration.timeoutMilliseconds
    );
    const attemptRepository = new KyselyInboundDeliveryAttemptRepository(database);
    const claimRepository = new KyselyInboundDeliveryClaimRepository(database);
    const commonWorkerDependencies = {
        repository: attemptRepository,
        workerId: deliveryWorkerConfiguration.workerId
    };
    const processBatch = createProcessInboundDeliveryBatchUseCase({
        claimInboundDeliveries: createClaimInboundDeliveriesUseCase({
            batchSize: deliveryWorkerConfiguration.batchSize,
            createLeaseToken: randomUUID,
            leaseDurationMilliseconds: deliveryWorkerConfiguration.leaseDurationMilliseconds,
            repository: claimRepository,
            workerId: deliveryWorkerConfiguration.workerId
        }),
        completeDelivered: createCompleteDeliveredInboundDeliveryAttemptUseCase(
            commonWorkerDependencies
        ),
        completeRetryable: createCompleteRetryableInboundDeliveryAttemptUseCase(
            commonWorkerDependencies
        ),
        completeTerminal: createCompleteTerminalInboundDeliveryAttemptUseCase(
            commonWorkerDependencies
        ),
        forwarder: new FetchIntegrationCoreOrderClient({
            configuration: coreClientConfiguration
        }),
        startAttempt: createStartInboundDeliveryAttemptUseCase({
            ...commonWorkerDependencies,
            createAttemptId: randomUUID
        })
    });
    deliveryWorker = createDeliveryWorkerScheduler({
        intervalMilliseconds: deliveryWorkerConfiguration.intervalMilliseconds,
        logger: application.log,
        metrics: metrics.deliveryWorker,
        processBatch,
        recoverExpired: createRecoverExpiredInboundDeliveriesUseCase({
            batchSize: deliveryWorkerConfiguration.batchSize,
            repository: attemptRepository
        })
    });
}

application.addHook("onClose", async () => {
    await deliveryWorker?.stop();
    await database.destroy();
});

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
    deliveryWorker?.start();
} catch (error) {
    application.log.error(error);
    process.exitCode = 1;
    await application.close();
}
