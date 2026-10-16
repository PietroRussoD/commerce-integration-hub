export const orderId = "018f38c2-1b95-7cc4-bb89-72d26a6f9f88";
export const deliveryId = "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21";

export const deliveryPage = {
  items: [
    {
      attemptCount: 2,
      completedAt: null,
      correlationId: "b374867a-07c4-4d82-a438-a04301731707",
      deliveryId,
      errorCode: "CORE_UNAVAILABLE",
      externalEventId: "DELIVERY-E2E-001",
      lastCoreOrderId: null,
      lastHttpStatus: 503,
      provider: "ERP_B",
      receivedAt: "2026-09-12T12:00:00Z",
      sourceSystem: "ERP_B",
      status: "EXHAUSTED",
      updatedAt: "2026-09-12T12:05:00Z",
    },
  ],
  nextCursor: null,
};

export const deliveryDetail = {
  ...deliveryPage.items[0],
  attempts: [
    {
      attemptId: "e09e6770-117f-4c6b-8f9d-2dc8bf1f7b70",
      attemptNumber: 2,
      completedAt: "2026-09-12T12:05:01Z",
      durationMilliseconds: 1_250,
      errorCode: "CORE_UNAVAILABLE",
      httpStatus: 503,
      outcome: "RETRYABLE_FAILURE" as const,
      safeErrorMessage: "The Core endpoint did not respond before the timeout",
      startedAt: "2026-09-12T12:05:00Z",
      traceId: "trace-e2e-42",
    },
  ],
  connectorId: "3a224e92-4a6b-4e73-ae04-d7f8042e8bbb",
  connectorMode: "POLLING",
  connectorStatus: "ACTIVE",
  mappingVersion: "erp-b-v2",
  nextAttemptAt: "2026-09-12T12:10:00Z",
  payloadExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  payloadRetained: true,
  safeErrorMessage: "The Core endpoint did not respond before the timeout",
};

export const orderPage = {
  items: [
    {
      id: orderId,
      sourceSystem: "MARKETPLACE_A",
      externalOrderId: "ORDER-E2E-001",
      status: "READY",
      currency: "EUR",
      totalAmount: "39.98",
      receivedAt: "2026-08-21T08:00:00Z",
      lastEventAt: "2026-08-21T08:00:05Z",
      processingAttempts: 1,
    },
  ],
  limit: 25,
  offset: 0,
  total: 1,
};

export const orderDetail = {
  id: orderId,
  sourceSystem: "MARKETPLACE_A",
  externalOrderId: "ORDER-E2E-001",
  status: "READY",
  currency: "EUR",
  totalAmount: "39.98",
  receivedAt: "2026-08-21T08:00:00Z",
  items: [
    {
      externalLineId: "LINE-1",
      sku: "SKU-E2E-001",
      description: "Browser-tested item",
      quantity: "2",
      unitPrice: "19.99",
      lineAmount: "39.98",
      position: 1,
    },
  ],
  timeline: [
    {
      id: "018f38c2-1b95-7cc4-bb89-72d26a6f9001",
      eventType: "ORDER_RECEIVED",
      fromStatus: null,
      toStatus: "RECEIVED",
      message: "Canonical order accepted",
      correlationId: "018f38c2-1b95-7cc4-bb89-72d26a6f9101",
      occurredAt: "2026-08-21T08:00:00Z",
    },
  ],
  processingAttempts: [],
};

export const receiveOrderResponse = {
  id: orderId,
  sourceSystem: "MARKETPLACE_A",
  externalId: "ORDER-E2E-001",
  currency: "EUR",
  totalAmount: "39.98",
  status: "RECEIVED",
  receivedAt: "2026-08-21T08:00:00Z",
  items: [],
};

export const searchProjectionStatus = {
  consumerEnabled: true,
  readAlias: "orders-read",
  availability: "AVAILABLE",
  lastProjectedEventOccurredAt: "2026-09-08T08:00:01Z",
  lastProjectedAt: "2026-09-08T08:00:01.250Z",
  lastProjectionProcessingDelayMilliseconds: 250,
  reconciliationInProgress: false,
  lastReconciliationCompletedAt: null,
  lastReconciliationScannedCount: null,
  lastReconciliationAppliedCount: null,
  lastReconciliationIgnoredCount: null,
  reindex: {
    phase: "IDLE",
    sourceIndex: null,
    candidateIndex: null,
    scannedCount: 0,
    appliedCount: 0,
    ignoredNonNewerVersionCount: 0,
  },
};

export const projectedOrderPage = {
  items: [
    {
      id: orderId,
      aggregateVersion: 2,
      sourceSystem: "MARKETPLACE_A",
      externalOrderId: "ORDER-SEARCH-001",
      status: "READY",
      currency: "EUR",
      totalAmount: "39.98",
      receivedAt: "2026-08-21T08:00:00Z",
      readyAt: "2026-08-21T08:00:05Z",
      itemSkus: ["SKU-E2E-001"],
      itemDescriptions: ["Browser-tested item"],
    },
  ],
  limit: 25,
  offset: 0,
  total: 1,
};
