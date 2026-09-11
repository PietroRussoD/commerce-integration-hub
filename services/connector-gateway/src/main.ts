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
import { createGetInboundDeliveryUseCase } from "./application/deliveries/get-inbound-delivery.js";
import { createListInboundDeliveriesUseCase } from "./application/deliveries/list-inbound-deliveries.js";
import { createAcquirePollingLeaseUseCase } from "./application/polling/acquire-polling-lease.js";
import { createBlockPollingConnectorUseCase } from "./application/polling/block-polling-connector.js";
import {
    createReleasePollingLeaseUseCase,
    createRenewPollingLeaseUseCase
} from "./application/polling/maintain-polling-lease.js";
import { createProcessErpBOrderPageUseCase } from "./application/polling/process-erp-b-order-page.js";
import { createRunErpBPollingUseCase } from "./application/polling/run-erp-b-polling.js";
import { readErpBClientConfiguration } from "./connectors/erp-b/client-configuration.js";
import { FetchErpBOrderPageClient } from "./connectors/erp-b/fetch-order-page-client.js";
import { readMarketplaceAConnectorId } from "./connectors/marketplace-a/connector-configuration.js";
import { readMarketplaceAWebhookSecurityConfiguration } from "./connectors/marketplace-a/webhook-security-configuration.js";
import { createConfiguredMarketplaceAWebhookAuthenticator } from "./connectors/marketplace-a/webhook-security.js";
import { loadDatabaseConfiguration } from "./infrastructure/database/database-configuration.js";
import { createDatabase } from "./infrastructure/database/database.js";
import { KyselyInboundDeliveryAttemptRepository } from "./infrastructure/database/kysely-inbound-delivery-attempt-repository.js";
import { KyselyInboundDeliveryClaimRepository } from "./infrastructure/database/kysely-inbound-delivery-claim-repository.js";
import { KyselyInboundDeliveryInspectionRepository } from "./infrastructure/database/kysely-inbound-delivery-inspection-repository.js";
import { KyselyInboundDeliveryRepository } from "./infrastructure/database/kysely-inbound-delivery-repository.js";
import { KyselyPolledOrderPageRepository } from "./infrastructure/database/kysely-polled-order-page-repository.js";
import { KyselyPollingLeaseRepository } from "./infrastructure/database/kysely-polling-lease-repository.js";
import { KyselyDatabaseReadiness } from "./infrastructure/database/kysely-database-readiness.js";
import { KyselyOperationalMetricsSource } from "./infrastructure/database/kysely-operational-metrics-source.js";
import { FetchIntegrationCoreOrderClient } from "./infrastructure/http/fetch-integration-core-order-client.js";
import { readIntegrationCoreClientConfiguration } from "./infrastructure/http/integration-core-client-configuration.js";
import { createConnectorGatewayMetrics } from "./infrastructure/observability/connector-gateway-metrics.js";
import { createOperatorJwtVerifier } from "./infrastructure/security/operator-jwt-verifier.js";
import { readOperatorSecurityConfiguration } from "./infrastructure/security/operator-security-configuration.js";
import {
    assertLeaseExceedsForwardingTimeout,
    readDeliveryWorkerConfiguration
} from "./infrastructure/scheduling/delivery-worker-configuration.js";
import {
    createDeliveryWorkerScheduler,
    type DeliveryWorkerScheduler
} from "./infrastructure/scheduling/delivery-worker-scheduler.js";
import {
    assertPollingLeaseExceedsRequestTimeout,
    readErpBPollingConfiguration
} from "./infrastructure/scheduling/erp-b-polling-configuration.js";
import {
    createErpBPollingScheduler,
    type ErpBPollingScheduler
} from "./infrastructure/scheduling/erp-b-polling-scheduler.js";

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
const erpBPollingConfiguration = readErpBPollingConfiguration(process.env);
const operatorSecurityConfiguration = readOperatorSecurityConfiguration(process.env);
const database = createDatabase(databaseConfiguration);
const metrics = createConnectorGatewayMetrics({
    operationalMetricsSource: new KyselyOperationalMetricsSource(database)
});
const databaseReadiness = new KyselyDatabaseReadiness(database);
const deliveryRepository = new KyselyInboundDeliveryRepository(database);
const deliveryInspectionRepository = new KyselyInboundDeliveryInspectionRepository(database);
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
    operatorDeliveries: {
        authorization:
            operatorSecurityConfiguration.oidcEnabled &&
            operatorSecurityConfiguration.authorizationEnabled
                ? {
                      enabled: true,
                      verifyToken: createOperatorJwtVerifier(operatorSecurityConfiguration)
                  }
                : { enabled: false },
        getDelivery: createGetInboundDeliveryUseCase(deliveryInspectionRepository),
        listDeliveries: createListInboundDeliveriesUseCase(deliveryInspectionRepository)
    },
    readiness: () => databaseReadiness.isReady()
});
let deliveryWorker: DeliveryWorkerScheduler | undefined;
let erpBPolling: ErpBPollingScheduler | undefined;

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

if (erpBPollingConfiguration.enabled) {
    const clientConfiguration = readErpBClientConfiguration(process.env);
    assertPollingLeaseExceedsRequestTimeout(
        erpBPollingConfiguration.leaseDurationMilliseconds,
        clientConfiguration.timeoutMilliseconds
    );
    const leaseRepository = new KyselyPollingLeaseRepository(database);
    const pageRepository = new KyselyPolledOrderPageRepository(database);
    const commonLeaseDependencies = {
        repository: leaseRepository,
        workerId: erpBPollingConfiguration.workerId
    };
    const runPolling = createRunErpBPollingUseCase({
        acquireLease: createAcquirePollingLeaseUseCase({
            ...commonLeaseDependencies,
            createLeaseToken: randomUUID,
            leaseDurationMilliseconds: erpBPollingConfiguration.leaseDurationMilliseconds
        }),
        blockConnector: createBlockPollingConnectorUseCase(commonLeaseDependencies),
        maxPagesPerRun: erpBPollingConfiguration.maxPagesPerRun,
        processPage: createProcessErpBOrderPageUseCase({
            pageRepository,
            pageSource: new FetchErpBOrderPageClient({ configuration: clientConfiguration }),
            workerId: erpBPollingConfiguration.workerId
        }),
        releaseLease: createReleasePollingLeaseUseCase(commonLeaseDependencies),
        renewLease: createRenewPollingLeaseUseCase({
            ...commonLeaseDependencies,
            leaseDurationMilliseconds: erpBPollingConfiguration.leaseDurationMilliseconds
        })
    });
    erpBPolling = createErpBPollingScheduler({
        connectorId: erpBPollingConfiguration.connectorId,
        intervalMilliseconds: erpBPollingConfiguration.intervalMilliseconds,
        logger: application.log,
        metrics: metrics.erpBPolling,
        runPolling
    });
}

application.addHook("onClose", async () => {
    await Promise.all([deliveryWorker?.stop(), erpBPolling?.stop()]);
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
    erpBPolling?.start();
} catch (error) {
    application.log.error(error);
    process.exitCode = 1;
    await application.close();
}
