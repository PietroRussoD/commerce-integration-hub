import { afterEach, expect, test, vi } from "vitest";

import {
  ConnectorGatewayApiError,
  getOperatorDelivery,
  listOperatorDeliveries,
  replayOperatorDelivery,
} from "./connectorGatewayClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("lists operator deliveries with bearer authentication and encoded filters", async () => {
  const body = { items: [], nextCursor: "next-page" };
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    listOperatorDeliveries({
      accessToken: "operator-token",
      cursor: "previous page",
      limit: 25,
      provider: "ERP_B",
      status: "EXHAUSTED",
    }),
  ).resolves.toEqual(body);

  expect(fetchMock).toHaveBeenCalledWith(
    "/gateway-api/api/v1/operator/deliveries?cursor=previous+page&limit=25&provider=ERP_B&status=EXHAUSTED",
    {
      headers: { Accept: "application/json", Authorization: "Bearer operator-token" },
      signal: undefined,
    },
  );
});

test("loads an operator delivery by its encoded ID", async () => {
  const body = { deliveryId: "delivery/42" };
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
  vi.stubGlobal("fetch", fetchMock);

  await expect(getOperatorDelivery({ accessToken: "operator-token", deliveryId: "delivery/42" })).resolves.toEqual(body);
  expect(fetchMock).toHaveBeenCalledWith("/gateway-api/api/v1/operator/deliveries/delivery%2F42", {
    headers: { Accept: "application/json", Authorization: "Bearer operator-token" },
    signal: undefined,
  });
});

test("preserves problem details from a rejected Gateway request", async () => {
  const problem = {
    type: "urn:problem:operator-authorization",
    title: "Operator authorization failed",
    status: 403,
    detail: "The token does not grant the required role",
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(problemResponse(problem)));

  const error = await listOperatorDeliveries({ accessToken: "operator-token" }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ConnectorGatewayApiError);
  expect(error).toMatchObject({ status: 403, problem, message: problem.detail });
});

test("replays a delivery with an idempotency key and reason", async () => {
  const body = { commandId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21", idempotent: false, outcome: "IN_PROGRESS" };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    replayOperatorDelivery({
      accessToken: "admin-token",
      deliveryId: "delivery/42",
      idempotencyKey: "426a23e6-5234-4d38-9907-e2979ab2d9f5",
      reason: "The Core endpoint is available again",
    }),
  ).resolves.toEqual(body);

  expect(fetchMock).toHaveBeenCalledWith("/gateway-api/api/v1/operator/deliveries/delivery%2F42/replay", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "426a23e6-5234-4d38-9907-e2979ab2d9f5",
    },
    body: JSON.stringify({ reason: "The Core endpoint is available again" }),
    signal: undefined,
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status: 200 });
}

test.each([
  { status: 202, body: "{" },
  { status: 202, body: JSON.stringify({}) },
  { status: 202, body: JSON.stringify({ commandId: "invalid", idempotent: false, outcome: "REPLAYED" }) },
  { status: 202, body: JSON.stringify({ commandId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21", idempotent: false, outcome: "UNKNOWN" }) },
  { status: 200, body: JSON.stringify({ commandId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21", idempotent: false, outcome: "REPLAYED" }) },
])("does not treat an unrecognized replay response as confirmation ($status, $body)", async ({ status, body }) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
  await expect(replayOperatorDelivery({
    accessToken: "synthetic-admin-token", deliveryId: "delivery-42", idempotencyKey: "synthetic-key", reason: "Synthetic recovery",
  })).rejects.toThrow();
});

function problemResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/problem+json" }, status: 403 });
}
