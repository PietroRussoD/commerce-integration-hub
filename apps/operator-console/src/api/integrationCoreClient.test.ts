import { afterEach, expect, test, vi } from "vitest";

import {
  getOperatorOrder,
  getOperatorOrderSearchProjectionStatus,
  IntegrationCoreApiError,
  listOperatorOrders,
  receiveOrder,
  searchOperatorOrders,
} from "./integrationCoreClient";

const receiveOrderRequest = {
  externalId: "ORDER-42",
  currency: "EUR",
  declaredTotalAmount: "39.98",
  items: [{ sku: "SKU-1", quantity: "2", unitPrice: "19.99" }],
};

const receiveOrderResponse = {
  id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
  sourceSystem: "MARKETPLACE_A",
  externalId: "ORDER-42",
  currency: "EUR",
  totalAmount: "39.98",
  status: "RECEIVED",
  receivedAt: "2026-08-26T08:00:00Z",
  items: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const operatorReads = [
  { name: "list", read: (accessToken?: string, signal?: AbortSignal) => listOperatorOrders({ accessToken, signal }) },
  { name: "detail", read: (accessToken?: string, signal?: AbortSignal) => getOperatorOrder({ accessToken, signal, orderId: "order-42" }) },
  { name: "projection status", read: (accessToken?: string, signal?: AbortSignal) => getOperatorOrderSearchProjectionStatus({ accessToken, signal }) },
  { name: "search", read: (accessToken?: string, signal?: AbortSignal) => searchOperatorOrders({ accessToken, signal, q: "blue" }) },
];

test.each(operatorReads)("sends the bearer credential and cancellation signal for $name", async ({ read }) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  const signal = new AbortController().signal;
  vi.stubGlobal("fetch", fetchMock);

  await read("synthetic-token", signal);

  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
    headers: { Accept: "application/json", Authorization: "Bearer synthetic-token" },
    signal,
  });
});

test.each(operatorReads)("omits Authorization without an operator token for $name", async ({ read }) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await read();

  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
    headers: { Accept: "application/json" },
    signal: undefined,
  });
});

test.each(operatorReads)("preserves 401 and 403 as typed errors for $name", async ({ read }) => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  for (const status of [401, 403]) {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    await expect(read("synthetic-token")).rejects.toMatchObject({ name: "IntegrationCoreApiError", status });
  }
});

test("requests operator orders with encoded filters", async () => {
  const responseBody = { items: [], limit: 10, offset: 20, total: 0 };
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(listOperatorOrders({ status: "READY", limit: 10, offset: 20 })).resolves.toEqual(responseBody);
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/operator/orders?status=READY&limit=10&offset=20", {
    headers: { Accept: "application/json" },
    signal: undefined,
  });
});

test("rejects unsuccessful operator order responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

  await expect(listOperatorOrders()).rejects.toThrow("Integration Core request failed with status 503");
});

test("requests an operator order by its encoded ID", async () => {
  const responseBody = {
    id: "order/42",
    sourceSystem: "MARKETPLACE_A",
    externalOrderId: "external-42",
    status: "READY",
    currency: "EUR",
    totalAmount: "12.50",
    receivedAt: "2026-08-25T08:00:00Z",
    items: [],
    timeline: [],
    processingAttempts: [],
  };
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(getOperatorOrder({ orderId: "order/42" })).resolves.toEqual(responseBody);
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/operator/orders/order%2F42", {
    headers: { Accept: "application/json" },
    signal: undefined,
  });
});

test("rejects unsuccessful operator order detail responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  await expect(getOperatorOrder({ orderId: "missing-order" })).rejects.toThrow(
    "Integration Core request failed with status 404",
  );
});

test("requests the operator search projection status", async () => {
  const responseBody = {
    consumerEnabled: true,
    readAlias: "orders-read",
    availability: "AVAILABLE",
    lastProjectedEventOccurredAt: "2026-09-08T08:00:01Z",
    lastProjectedAt: "2026-09-08T08:00:01.250Z",
    lastProjectionProcessingDelayMilliseconds: 250,
    reconciliationInProgress: false,
    lastReconciliationCompletedAt: "2026-09-08T08:00:00Z",
    lastReconciliationScannedCount: 20,
    lastReconciliationAppliedCount: 3,
    lastReconciliationIgnoredCount: 17,
    reindex: {
      phase: "IDLE",
      sourceIndex: null,
      candidateIndex: null,
      scannedCount: 0,
      appliedCount: 0,
      ignoredNonNewerVersionCount: 0,
    },
  };
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(getOperatorOrderSearchProjectionStatus()).resolves.toEqual(responseBody);
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/operator/orders/search/status", {
    headers: { Accept: "application/json" },
    signal: undefined,
  });
});

test("searches projected orders with encoded filters", async () => {
  const responseBody = { items: [], limit: 10, offset: 20, total: 0 };
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    searchOperatorOrders({
      q: "blue shirt",
      sourceSystem: "MARKETPLACE_A",
      externalOrderId: "order/42",
      status: "READY",
      currency: "EUR",
      sku: "SKU 42",
      receivedAtFrom: "2026-09-01T00:00:00Z",
      receivedAtBefore: "2026-09-02T00:00:00Z",
      limit: 10,
      offset: 20,
    }),
  ).resolves.toEqual(responseBody);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/v1/operator/orders/search?q=blue+shirt&sourceSystem=MARKETPLACE_A&externalOrderId=order%2F42&status=READY&currency=EUR&sku=SKU+42&receivedAtFrom=2026-09-01T00%3A00%3A00Z&receivedAtBefore=2026-09-02T00%3A00%3A00Z&limit=10&offset=20",
    { headers: { Accept: "application/json" }, signal: undefined },
  );
});

test("returns a typed error when projected order search fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));

  await expect(searchOperatorOrders({ q: "" })).rejects.toMatchObject({ status: 400 });
});

test.each([
  [201, "CREATED"],
  [200, "REPLAYED"],
] as const)("submits an order and maps status %i to %s", async (status, outcome) => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(receiveOrderResponse), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    receiveOrder({
      request: receiveOrderRequest,
      sourceApiKey: "key-id.secret",
      correlationId: "018f38c2-1b95-7cc4-bb89-72d26a6f9000",
    }),
  ).resolves.toEqual({ order: receiveOrderResponse, outcome });
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/orders", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Correlation-ID": "018f38c2-1b95-7cc4-bb89-72d26a6f9000",
      "X-Source-API-Key": "key-id.secret",
    },
    body: JSON.stringify(receiveOrderRequest),
    signal: undefined,
  });
});

test("preserves problem details from a rejected order", async () => {
  const problem = {
    type: "urn:problem:request-validation",
    title: "Request validation failed",
    status: 400,
    detail: "One or more request fields are invalid",
    instance: "/api/v1/orders",
    code: "REQUEST_VALIDATION_FAILED",
    errors: [{ field: "items[0].quantity", message: "must match the decimal format" }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(problem), {
        status: 400,
        headers: { "Content-Type": "application/problem+json" },
      }),
    ),
  );

  const error = await receiveOrder({ request: receiveOrderRequest, sourceApiKey: "key-id.secret" }).catch(
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(IntegrationCoreApiError);
  expect(error).toMatchObject({ status: 400, problem, message: problem.detail });
});
