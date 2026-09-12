import { afterEach, expect, test, vi } from "vitest";

import {
  ConnectorGatewayApiError,
  getOperatorDelivery,
  listOperatorDeliveries,
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status: 200 });
}

function problemResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/problem+json" }, status: 403 });
}
