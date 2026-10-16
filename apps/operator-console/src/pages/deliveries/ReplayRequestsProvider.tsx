import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";

import { replayOperatorDelivery, type ReplayOperatorDeliveryResponse } from "../../api/connectorGatewayClient";
import { type ReplayRequest, type ReplayRequestState, ReplayRequestsContext } from "./replayRequestsContext";

export function ReplayRequestsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const pending = useRef(new Set<string>());
  const [requests, setRequests] = useState<ReadonlyMap<string, ReplayRequestState>>(() => new Map());

  const reset = useCallback((deliveryId: string, cacheScope: string) => {
    if (pending.current.has(deliveryId)) return;
    setRequests((current) => {
      if (current.get(deliveryId)?.cacheScope !== cacheScope) return current;
      const next = new Map(current);
      next.delete(deliveryId);
      return next;
    });
  }, []);

  const submit = useCallback(async (request: ReplayRequest): Promise<ReplayOperatorDeliveryResponse> => {
    // Lock synchronously, before React renders disabled controls. The lock belongs
    // to the delivery across routes and token changes until the HTTP request settles.
    if (pending.current.has(request.deliveryId)) throw new Error("A replay request for this delivery is already pending.");
    pending.current.add(request.deliveryId);
    const state = { cacheScope: request.cacheScope, reason: request.reason };
    setRequests((current) => new Map(current).set(request.deliveryId, { ...state, isPending: true }));

    try {
      // An already-sent command cannot be cancelled by aborting its HTTP response.
      // Keep the original credential; never resubmit with a replacement token.
      const response = await replayOperatorDelivery({
        accessToken: request.accessToken,
        deliveryId: request.deliveryId,
        idempotencyKey: crypto.randomUUID(),
        reason: request.reason,
      });
      // Completion after navigation still refreshes the originating session's
      // data, without invalidating a new identity's active queries.
      void queryClient.invalidateQueries({ queryKey: ["operator-deliveries", request.cacheScope] });
      void queryClient.invalidateQueries({ queryKey: ["operator-delivery", request.cacheScope, request.deliveryId] });
      setRequests((current) => new Map(current).set(request.deliveryId, { ...state, isPending: false, data: response }));
      return response;
    } catch (error) {
      setRequests((current) => new Map(current).set(request.deliveryId, {
        ...state, isPending: false, error: error instanceof Error ? error : new Error(String(error)),
      }));
      throw error;
    } finally {
      pending.current.delete(request.deliveryId);
    }
  }, [queryClient]);

  const value = useMemo(() => ({
    pendingDeliveryIds: new Set(Array.from(requests).filter(([, request]) => request.isPending).map(([deliveryId]) => deliveryId)),
    requests,
    reset,
    submit,
  }), [requests, reset, submit]);
  return <ReplayRequestsContext.Provider value={value}>{children}</ReplayRequestsContext.Provider>;
}
