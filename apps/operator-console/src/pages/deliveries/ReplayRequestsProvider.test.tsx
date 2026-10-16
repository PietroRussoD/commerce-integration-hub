import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { ConnectorGatewayApiError, replayOperatorDelivery, type ReplayOperatorDeliveryResponse } from "../../api/connectorGatewayClient";
import { ReplayRequestsProvider } from "./ReplayRequestsProvider";
import { replayRequestKey, useReplayRequests } from "./replayRequestsContext";

vi.mock(import("../../api/connectorGatewayClient"), async (importOriginal) => ({ ...await importOriginal(), replayOperatorDelivery: vi.fn() }));
const replay = vi.mocked(replayOperatorDelivery);
const request = { accessToken: "synthetic-admin-token", cacheScope: "session-a", deliveryId: "delivery-42", reason: "Synthetic recovery" };
const response: ReplayOperatorDeliveryResponse = { commandId: "command-42", idempotent: false, outcome: "REPLAYED" };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("locks a delivery before a render, including attempts from another session", async () => {
  const gate = deferred();
  replay.mockReturnValueOnce(gate.promise);
  const { result } = renderRequests();
  let sent!: Promise<ReplayOperatorDeliveryResponse>;
  await act(async () => {
    sent = result.current.submit(request);
    await expect(result.current.submit({ ...request, accessToken: "other-token", cacheScope: "session-b" })).rejects.toThrow("already pending");
  });
  expect(result.current.pendingDeliveryIds.has(request.deliveryId)).toBe(true);
  expect(replay).toHaveBeenCalledOnce();
  expect(replay).toHaveBeenCalledWith(expect.objectContaining({ accessToken: request.accessToken, reason: request.reason }));
  expect(replay.mock.calls[0][0].signal).toBeUndefined();
  await act(async () => { gate.resolve(response); await sent; });
  expect(result.current.pendingDeliveryIds.size).toBe(0);
});

test("completion invalidates only the originating session and target", async () => {
  replay.mockResolvedValueOnce(response);
  const { result, client } = renderRequests();
  const originList = ["operator-deliveries", "session-a", { status: "ALL" }];
  const originDetail = ["operator-delivery", "session-a", request.deliveryId];
  const otherList = ["operator-deliveries", "session-b", { status: "ALL" }];
  const otherDetail = ["operator-delivery", "session-b", request.deliveryId];
  const unrelatedDetail = ["operator-delivery", "session-a", "other-delivery"];
  for (const key of [originList, originDetail, otherList, otherDetail, unrelatedDetail]) client.setQueryData(key, {});

  await act(async () => { await result.current.submit(request); });

  expect(client.getQueryState(originList)?.isInvalidated).toBe(true);
  expect(client.getQueryState(originDetail)?.isInvalidated).toBe(true);
  for (const key of [otherList, otherDetail, unrelatedDetail]) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.queryKey))).not.toContain(request.accessToken);
});

test("releases failed requests without automatically retrying or blocking another delivery", async () => {
  const failed = deferred();
  const succeeded = deferred();
  replay.mockReturnValueOnce(failed.promise).mockReturnValueOnce(succeeded.promise).mockResolvedValueOnce(response);
  const { result } = renderRequests();
  let first!: Promise<ReplayOperatorDeliveryResponse>;
  let second!: Promise<ReplayOperatorDeliveryResponse>;
  act(() => {
    first = result.current.submit(request);
    second = result.current.submit({ ...request, deliveryId: "delivery-43" });
  });
  expect(result.current.pendingDeliveryIds.size).toBe(2);
  await act(async () => {
    failed.reject(new Error("Synthetic failure"));
    await expect(first).rejects.toThrow("Synthetic failure");
  });
  expect(result.current.pendingDeliveryIds.has(request.deliveryId)).toBe(false);
  expect(result.current.pendingDeliveryIds.has("delivery-43")).toBe(true);
  expect(replay).toHaveBeenCalledTimes(2);
  await act(async () => { await result.current.submit(request); });
  expect(replay).toHaveBeenCalledTimes(3);
  await act(async () => { succeeded.resolve(response); await second; });
  expect(result.current.pendingDeliveryIds.size).toBe(0);
});

test.each([new TypeError("Failed to fetch"), new ConnectorGatewayApiError(503), new ConnectorGatewayApiError(409)])(
  "preserves an uncertain command through reset and a manual retry (%s)", async (error) => {
    replay.mockRejectedValueOnce(error).mockResolvedValueOnce(response);
    const { result } = renderRequests();
    await act(async () => { await expect(result.current.submit(request)).rejects.toThrow(); });
    const key = replayRequestKey(request.cacheScope, request.deliveryId);
    const original = result.current.requests.get(key)!;
    expect(original.isUncertain).toBe(true);
    act(() => result.current.reset(request.deliveryId, request.cacheScope));
    expect(result.current.requests.get(key)?.idempotencyKey).toBe(original.idempotencyKey);
    await act(async () => { await result.current.submit({ ...request, reason: `  ${request.reason}  ` }); });
    expect(replay.mock.calls[1][0]).toEqual(replay.mock.calls[0][0]);
    expect(result.current.requests.get(key)?.isUncertain).toBe(false);
  },
);

test("an authorization failure during recovery does not resolve the original command", async () => {
  replay.mockRejectedValueOnce(new TypeError("Lost response"))
    .mockRejectedValueOnce(new ConnectorGatewayApiError(401))
    .mockResolvedValueOnce(response);
  const { result } = renderRequests();
  await act(async () => { await expect(result.current.submit(request)).rejects.toThrow(); });
  await act(async () => { await expect(result.current.submit(request)).rejects.toThrow(); });
  expect(result.current.requests.get(replayRequestKey(request.cacheScope, request.deliveryId))?.isUncertain).toBe(true);
  await act(async () => { await result.current.submit(request); });
  expect(new Set(replay.mock.calls.map(([call]) => call.idempotencyKey)).size).toBe(1);
});

test.each([
  new ConnectorGatewayApiError(400), new ConnectorGatewayApiError(401), new ConnectorGatewayApiError(403),
  new ConnectorGatewayApiError(409, {
    type: "urn:problem:delivery-not-replayable", title: "Delivery replay rejected", status: 409, detail: "Synthetic rejection",
  }),
])("a new confirmation after a definitive rejection creates a new command (%s)", async (error) => {
  replay.mockRejectedValueOnce(error).mockResolvedValueOnce(response);
  const { result } = renderRequests();
  await act(async () => { await expect(result.current.submit(request)).rejects.toThrow(); });
  expect(result.current.requests.get(replayRequestKey(request.cacheScope, request.deliveryId))?.isUncertain).toBe(false);
  await act(async () => { await result.current.submit(request); });
  expect(replay.mock.calls[1][0].idempotencyKey).not.toBe(replay.mock.calls[0][0].idempotencyKey);
});

test("an audited rejection settles an uncertain command; a new intention receives a new key", async () => {
  replay.mockRejectedValueOnce(new TypeError("Lost response"))
    .mockRejectedValueOnce(new ConnectorGatewayApiError(409, {
      type: "urn:problem:delivery-payload-expired", title: "Delivery replay rejected", status: 409, detail: "Synthetic rejection",
    })).mockResolvedValueOnce(response);
  const { result } = renderRequests();
  for (let index = 0; index < 2; index++) {
    await act(async () => { await expect(result.current.submit(request)).rejects.toThrow(); });
  }
  expect(replay.mock.calls[1][0].idempotencyKey).toBe(replay.mock.calls[0][0].idempotencyKey);
  const key = replayRequestKey(request.cacheScope, request.deliveryId);
  expect(result.current.requests.get(key)?.isUncertain).toBe(false);
  act(() => result.current.reset(request.deliveryId, request.cacheScope));
  expect(result.current.requests.has(key)).toBe(false);
  await act(async () => { await result.current.submit({ ...request, reason: "A separate recovery intention" }); });
  expect(replay.mock.calls[2][0].idempotencyKey).not.toBe(replay.mock.calls[0][0].idempotencyKey);
});

test("IN_PROGRESS can be checked manually using the same key and reason", async () => {
  replay.mockResolvedValueOnce({ ...response, outcome: "IN_PROGRESS" }).mockResolvedValueOnce(response);
  const { result } = renderRequests();
  await act(async () => { await result.current.submit(request); });
  act(() => result.current.reset(request.deliveryId, request.cacheScope));
  await act(async () => { await result.current.submit(request); });
  expect(replay.mock.calls[1][0]).toEqual(replay.mock.calls[0][0]);
});

test("an unresolved command cannot change reason and is not overwritten by another session", async () => {
  replay.mockRejectedValueOnce(new TypeError("Lost response")).mockResolvedValueOnce(response).mockResolvedValueOnce(response);
  const { result } = renderRequests();
  await act(async () => { await expect(result.current.submit(request)).rejects.toThrow(); });
  await act(async () => { await expect(result.current.submit({ ...request, reason: "Changed reason" })).rejects.toThrow("before changing its reason"); });
  expect(replay).toHaveBeenCalledOnce();
  await act(async () => { await result.current.submit({ ...request, accessToken: "other-token", cacheScope: "session-b" }); });
  expect(replay.mock.calls[1][0].idempotencyKey).not.toBe(replay.mock.calls[0][0].idempotencyKey);
  await act(async () => { await result.current.submit(request); });
  expect(replay.mock.calls[2][0].idempotencyKey).toBe(replay.mock.calls[0][0].idempotencyKey);
  expect(JSON.stringify(Array.from(result.current.requests.values()))).not.toContain("token");
});

test("opening a new draft preserves confirmation until a separate intention is submitted", async () => {
  const next = deferred();
  replay.mockResolvedValueOnce(response).mockReturnValueOnce(next.promise);
  const { result } = renderRequests();
  const key = replayRequestKey(request.cacheScope, request.deliveryId);
  await act(async () => { await result.current.submit(request); });
  act(() => result.current.reset(request.deliveryId, request.cacheScope));
  expect(result.current.requests.get(key)?.data).toBeUndefined();
  expect(result.current.requests.get(key)?.lastResponse).toEqual(response);

  let sent!: Promise<ReplayOperatorDeliveryResponse>;
  act(() => { sent = result.current.submit(request); });
  expect(result.current.requests.get(key)?.lastResponse).toBeUndefined();
  expect(replay.mock.calls[1][0].idempotencyKey).not.toBe(replay.mock.calls[0][0].idempotencyKey);
  const nextResponse = { ...response, commandId: "next-command" };
  await act(async () => { next.resolve(nextResponse); await sent; });
  expect(result.current.requests.get(key)?.lastResponse).toEqual(nextResponse);
});

test("a recognized concurrent rejection refreshes only its originating session", async () => {
  replay.mockRejectedValueOnce(new ConnectorGatewayApiError(409, {
    type: "urn:problem:connector-not-active", title: "Delivery replay rejected", status: 409, detail: "Synthetic rejection",
  }));
  const { result, client } = renderRequests();
  const own = ["operator-delivery", request.cacheScope, request.deliveryId];
  const other = ["operator-delivery", "session-b", request.deliveryId];
  client.setQueryData(own, {});
  client.setQueryData(other, {});
  await act(async () => { await expect(result.current.submit(request)).rejects.toThrow(); });
  expect(client.getQueryState(own)?.isInvalidated).toBe(true);
  expect(client.getQueryState(other)?.isInvalidated).toBe(false);
});

function renderRequests() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><ReplayRequestsProvider>{children}</ReplayRequestsProvider></QueryClientProvider>
  );
  return { ...renderHook(useReplayRequests, { wrapper }), client };
}

function deferred() {
  let resolve!: (value: ReplayOperatorDeliveryResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReplayOperatorDeliveryResponse>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
