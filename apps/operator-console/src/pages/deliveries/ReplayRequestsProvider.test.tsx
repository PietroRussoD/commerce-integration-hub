import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { replayOperatorDelivery, type ReplayOperatorDeliveryResponse } from "../../api/connectorGatewayClient";
import { ReplayRequestsProvider } from "./ReplayRequestsProvider";
import { useReplayRequests } from "./replayRequestsContext";

vi.mock("../../api/connectorGatewayClient", () => ({ replayOperatorDelivery: vi.fn() }));
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
