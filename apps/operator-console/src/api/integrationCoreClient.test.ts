import { afterEach, expect, test, vi } from "vitest";

import { getOperatorOrder, listOperatorOrders } from "./integrationCoreClient";

afterEach(() => {
  vi.unstubAllGlobals();
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

  await expect(listOperatorOrders()).rejects.toThrow("Operator order request failed with status 503");
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
    "Operator order detail request failed with status 404",
  );
});
