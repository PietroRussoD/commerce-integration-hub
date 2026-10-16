import type { paths } from "./generated/connector-gateway";

export type OperatorDeliveryPage =
  paths["/api/v1/operator/deliveries"]["get"]["responses"]["200"]["content"]["application/json"];

export type OperatorDeliveryDetail =
  paths["/api/v1/operator/deliveries/{deliveryId}"]["get"]["responses"]["200"]["content"]["application/json"];

export type ReplayOperatorDeliveryResponse =
  paths["/api/v1/operator/deliveries/{deliveryId}/replay"]["post"]["responses"]["202"]["content"]["application/json"];

export type GatewayProblem =
  paths["/api/v1/operator/deliveries"]["get"]["responses"]["401"]["content"]["application/json"];

export class ConnectorGatewayApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem?: GatewayProblem,
  ) {
    super(problem?.detail ?? `Connector Gateway request failed with status ${status}`);
    this.name = "ConnectorGatewayApiError";
  }
}

export interface ListOperatorDeliveriesParameters {
  accessToken: string;
  cursor?: string;
  limit?: number;
  provider?: "ERP_B" | "MARKETPLACE_A";
  signal?: AbortSignal;
  status?: "BLOCKED_CONFIGURATION" | "DELIVERED" | "EXHAUSTED" | "FORWARDING" | "PERMANENT_FAILURE" | "RECEIVED" | "RETRY_WAIT";
}

export interface GetOperatorDeliveryParameters {
  accessToken: string;
  deliveryId: string;
  signal?: AbortSignal;
}

export interface ReplayOperatorDeliveryParameters {
  accessToken: string;
  deliveryId: string;
  idempotencyKey: string;
  reason: string;
  signal?: AbortSignal;
}

export async function listOperatorDeliveries({
  accessToken,
  cursor,
  limit,
  provider,
  signal,
  status,
}: ListOperatorDeliveriesParameters): Promise<OperatorDeliveryPage> {
  const search = new URLSearchParams();
  const parameters = { cursor, limit, provider, status };

  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) search.set(name, value.toString());
  }

  const query = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetch(`/gateway-api/api/v1/operator/deliveries${query}`, {
    headers: operatorHeaders(accessToken),
    signal,
  });

  if (!response.ok) throw new ConnectorGatewayApiError(response.status, await readProblem(response));

  return response.json() as Promise<OperatorDeliveryPage>;
}

export async function getOperatorDelivery({
  accessToken,
  deliveryId,
  signal,
}: GetOperatorDeliveryParameters): Promise<OperatorDeliveryDetail> {
  const response = await fetch(`/gateway-api/api/v1/operator/deliveries/${encodeURIComponent(deliveryId)}`, {
    headers: operatorHeaders(accessToken),
    signal,
  });

  if (!response.ok) throw new ConnectorGatewayApiError(response.status, await readProblem(response));

  return response.json() as Promise<OperatorDeliveryDetail>;
}

export async function replayOperatorDelivery({
  accessToken,
  deliveryId,
  idempotencyKey,
  reason,
  signal,
}: ReplayOperatorDeliveryParameters): Promise<ReplayOperatorDeliveryResponse> {
  const response = await fetch(`/gateway-api/api/v1/operator/deliveries/${encodeURIComponent(deliveryId)}/replay`, {
    method: "POST",
    headers: {
      ...operatorHeaders(accessToken),
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ reason }),
    signal,
  });

  if (!response.ok) throw new ConnectorGatewayApiError(response.status, await readProblem(response));

  if (response.status !== 202) throw new Error("The Gateway returned an unexpected replay response status");
  const body: unknown = await response.json();
  if (!isReplayResponse(body)) throw new Error("The Gateway replay response could not be confirmed");
  return body;
}

function isReplayResponse(value: unknown): value is ReplayOperatorDeliveryResponse {
  if (typeof value !== "object" || value === null) return false;
  return "commandId" in value && typeof value.commandId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.commandId)
    && "idempotent" in value && typeof value.idempotent === "boolean"
    && "outcome" in value && (value.outcome === "REPLAYED" || value.outcome === "IN_PROGRESS");
}

function operatorHeaders(accessToken: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

async function readProblem(response: Response): Promise<GatewayProblem | undefined> {
  if (!response.headers.get("Content-Type")?.includes("json")) return undefined;

  try {
    return (await response.json()) as GatewayProblem;
  } catch {
    return undefined;
  }
}
