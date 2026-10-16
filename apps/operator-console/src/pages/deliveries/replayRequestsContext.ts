import { createContext, useContext } from "react";

import type { ReplayOperatorDeliveryParameters, ReplayOperatorDeliveryResponse } from "../../api/connectorGatewayClient";

export interface ReplayRequest extends Omit<ReplayOperatorDeliveryParameters, "idempotencyKey" | "signal"> {
  cacheScope: string;
}

export interface ReplayRequestState {
  cacheScope: string;
  deliveryId: string;
  idempotencyKey: string;
  reason: string;
  isPending: boolean;
  isUncertain: boolean;
  data?: ReplayOperatorDeliveryResponse;
  error?: Error;
}

export function replayRequestKey(cacheScope: string, deliveryId: string): string {
  return JSON.stringify([cacheScope, deliveryId]);
}

export function isReplayUnresolved(request: ReplayRequestState | undefined): boolean {
  return request?.isUncertain === true || request?.data?.outcome === "IN_PROGRESS";
}

export interface ReplayRequestsContextValue {
  pendingDeliveryIds: ReadonlySet<string>;
  requests: ReadonlyMap<string, ReplayRequestState>;
  reset: (deliveryId: string, cacheScope: string) => void;
  submit: (request: ReplayRequest) => Promise<ReplayOperatorDeliveryResponse>;
}

export const ReplayRequestsContext = createContext<ReplayRequestsContextValue | undefined>(undefined);

export function useReplayRequests(): ReplayRequestsContextValue {
  const value = useContext(ReplayRequestsContext);
  if (value === undefined) throw new Error("useReplayRequests must be used within ReplayRequestsProvider");
  return value;
}
