export const orderId = "018f38c2-1b95-7cc4-bb89-72d26a6f9f88";

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
