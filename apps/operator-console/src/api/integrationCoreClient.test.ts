import { afterEach, expect, test, vi } from "vitest";

import { listOperatorOrders } from "./integrationCoreClient";

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
