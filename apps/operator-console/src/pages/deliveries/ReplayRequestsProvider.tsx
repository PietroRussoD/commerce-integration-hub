import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";

import { ConnectorGatewayApiError, replayOperatorDelivery, type ReplayOperatorDeliveryResponse } from "../../api/connectorGatewayClient";
import { isReplayUnresolved, replayRequestKey, type ReplayRequest, type ReplayRequestState, ReplayRequestsContext } from "./replayRequestsContext";

export function ReplayRequestsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const pending = useRef(new Set<string>());
  // Command identity must be available synchronously, including between retries
  // before React has rendered. Credentials are never retained in this registry.
  const commands = useRef(new Map<string, ReplayRequestState>());
  const [requests, setRequests] = useState<ReadonlyMap<string, ReplayRequestState>>(() => new Map());

  const updateRequest = useCallback((key: string, state: ReplayRequestState) => {
    commands.current.set(key, state);
    setRequests(new Map(commands.current));
  }, []);

  const reset = useCallback((deliveryId: string, cacheScope: string) => {
    const key = replayRequestKey(cacheScope, deliveryId);
    const current = commands.current.get(key);
    if (pending.current.has(deliveryId) || isReplayUnresolved(current)) return;
    if (current?.lastResponse !== undefined) {
      updateRequest(key, { ...current, data: undefined, error: undefined });
      return;
    }
    commands.current.delete(key);
    setRequests(new Map(commands.current));
  }, [updateRequest]);

  const submit = useCallback(async (request: ReplayRequest): Promise<ReplayOperatorDeliveryResponse> => {
    // Lock synchronously, before React renders disabled controls. The lock belongs
    // to the delivery across routes and token changes until the HTTP request settles.
    if (pending.current.has(request.deliveryId)) throw new Error("A replay request for this delivery is already pending.");
    const key = replayRequestKey(request.cacheScope, request.deliveryId);
    const previous = commands.current.get(key);
    const unresolved = isReplayUnresolved(previous);
    const reason = request.reason.trim();
    if (reason.length === 0 || reason.length > 1_000) throw new Error("A replay reason of 1 to 1000 characters is required.");
    if (unresolved && previous!.reason !== reason) throw new Error("Resolve the existing replay request before changing its reason.");
    const state = {
      cacheScope: request.cacheScope,
      deliveryId: request.deliveryId,
      idempotencyKey: unresolved ? previous!.idempotencyKey : crypto.randomUUID(),
      reason,
      lastResponse: unresolved ? previous?.lastResponse : undefined,
    };
    pending.current.add(request.deliveryId);
    updateRequest(key, { ...state, isPending: true, isUncertain: unresolved });

    try {
      // An already-sent command cannot be cancelled by aborting its HTTP response.
      // Keep the original credential; never resubmit with a replacement token.
      const response = await replayOperatorDelivery({
        accessToken: request.accessToken,
        deliveryId: request.deliveryId,
        idempotencyKey: state.idempotencyKey,
        reason: state.reason,
      });
      // Completion after navigation still refreshes the originating session's
      // data, without invalidating a new identity's active queries.
      void queryClient.invalidateQueries({ queryKey: ["operator-deliveries", request.cacheScope] });
      void queryClient.invalidateQueries({ queryKey: ["operator-delivery", request.cacheScope, request.deliveryId] });
      updateRequest(key, { ...state, isPending: false, isUncertain: false, data: response, lastResponse: response });
      return response;
    } catch (error) {
      const isUncertain = isOutcomeUncertain(error, unresolved);
      updateRequest(key, {
        ...state,
        isPending: false,
        isUncertain,
        lastResponse: isUncertain ? state.lastResponse : undefined,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    } finally {
      pending.current.delete(request.deliveryId);
    }
  }, [queryClient, updateRequest]);

  const value = useMemo(() => ({
    pendingDeliveryIds: new Set(Array.from(requests.values()).filter((request) => request.isPending).map((request) => request.deliveryId)),
    requests,
    reset,
    submit,
  }), [requests, reset, submit]);
  return <ReplayRequestsContext.Provider value={value}>{children}</ReplayRequestsContext.Provider>;
}

function isOutcomeUncertain(error: unknown, previouslyUnresolved: boolean): boolean {
  if (!(error instanceof ConnectorGatewayApiError)) return true;

  // These 409 responses come from the audited replay result (including a repeated
  // rejection). Generic proxy failures and idempotency conflicts prove no outcome.
  const rejectionTypes = [
    "urn:problem:delivery-not-found",
    "urn:problem:delivery-not-replayable",
    "urn:problem:delivery-payload-expired",
    "urn:problem:connector-not-active",
  ];
  if (error.status === 409 && rejectionTypes.includes(error.problem?.type ?? "")) return false;
  // A failed authorization/validation on a recovery attempt cannot settle the
  // original command whose response was lost.
  if (previouslyUnresolved) return true;
  return ![400, 401, 403].includes(error.status);
}
