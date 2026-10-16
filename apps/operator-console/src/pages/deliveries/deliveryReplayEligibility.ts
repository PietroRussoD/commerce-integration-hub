import { ConnectorGatewayApiError, type OperatorDeliveryDetail } from "../../api/connectorGatewayClient";

export type ReplayDeliveryTarget = Pick<OperatorDeliveryDetail, "deliveryId" | "status" | "connectorStatus" | "payloadRetained" | "payloadExpiresAt">;
export type DeliveryPayloadState = "available" | "missing" | "expired" | "unknown";
export type ReplayBlockingReason = "permission" | "state" | "connector" | "payloadMissing" | "payloadExpired" | "payloadUnknown" | "updating" | "readFailed";

export function getDeliveryPayloadState(delivery: Pick<ReplayDeliveryTarget, "payloadRetained" | "payloadExpiresAt">, now: number): DeliveryPayloadState {
  if (!delivery.payloadRetained) return "missing";
  const expiresAt = Date.parse(delivery.payloadExpiresAt);
  if (!Number.isFinite(expiresAt)) return "unknown";
  return expiresAt <= now ? "expired" : "available";
}

export function getReplayBlockingReasons(delivery: ReplayDeliveryTarget, hasPermission: boolean, payload: DeliveryPayloadState): ReplayBlockingReason[] {
  const reasons: ReplayBlockingReason[] = [];
  if (!hasPermission) reasons.push("permission");
  if (delivery.status !== "EXHAUSTED") reasons.push("state");
  if (payload === "missing") reasons.push("payloadMissing");
  if (payload === "expired") reasons.push("payloadExpired");
  if (payload === "unknown") reasons.push("payloadUnknown");
  if (delivery.connectorStatus !== "ACTIVE") reasons.push("connector");
  return reasons;
}

const replayRejectionReasons = {
  "urn:problem:delivery-not-found": "deliveryMissing",
  "urn:problem:delivery-not-replayable": "state",
  "urn:problem:delivery-payload-expired": "payloadUnavailable",
  "urn:problem:connector-not-active": "connector",
} as const;

export function getReplayRejectionReason(error: unknown) {
  if (error === undefined || !(error instanceof ConnectorGatewayApiError) || error.status !== 409) return undefined;
  const type = error.problem?.type;
  if (type === undefined || !Object.hasOwn(replayRejectionReasons, type)) return undefined;
  return replayRejectionReasons[type as keyof typeof replayRejectionReasons];
}
