import type { paths } from "./generated/integration-core";

export type OperatorOrderPage =
  paths["/api/v1/operator/orders"]["get"]["responses"]["200"]["content"]["application/json"];

export type OperatorOrderDetail =
  paths["/api/v1/operator/orders/{orderId}"]["get"]["responses"]["200"]["content"]["application/json"];

export type OperatorOrderSearchProjectionStatus =
  paths["/api/v1/operator/orders/search/status"]["get"]["responses"]["200"]["content"]["application/json"];

export type OperatorOrderSearchPage =
  paths["/api/v1/operator/orders/search"]["get"]["responses"]["200"]["content"]["application/json"];

export type ReceiveOrderRequest =
  paths["/api/v1/orders"]["post"]["requestBody"]["content"]["application/json"];

export type ReceiveOrderResponse =
  paths["/api/v1/orders"]["post"]["responses"]["201"]["content"]["application/json"];

export type IntegrationCoreProblem =
  paths["/api/v1/orders"]["post"]["responses"]["400"]["content"]["application/problem+json"];

export interface ReceiveOrderParameters {
  request: ReceiveOrderRequest;
  sourceApiKey: string;
  correlationId?: string;
  signal?: AbortSignal;
}

export interface ReceiveOrderResult {
  order: ReceiveOrderResponse;
  outcome: "CREATED" | "REPLAYED";
}

export class IntegrationCoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem?: IntegrationCoreProblem,
  ) {
    super(problem?.detail ?? `Integration Core request failed with status ${status}`);
    this.name = "IntegrationCoreApiError";
  }
}

export interface ListOperatorOrdersParameters {
  status?: "RECEIVED" | "PROCESSING" | "READY";
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export interface GetOperatorOrderParameters {
  orderId: string;
  signal?: AbortSignal;
}

export interface GetOperatorOrderSearchProjectionStatusParameters {
  signal?: AbortSignal;
}

export interface SearchOperatorOrdersParameters {
  q?: string;
  sourceSystem?: string;
  externalOrderId?: string;
  status?: string;
  currency?: string;
  sku?: string;
  receivedAtFrom?: string;
  receivedAtBefore?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export async function listOperatorOrders({
  status,
  limit,
  offset,
  signal,
}: ListOperatorOrdersParameters = {}): Promise<OperatorOrderPage> {
  const search = new URLSearchParams();

  if (status !== undefined) search.set("status", status);
  if (limit !== undefined) search.set("limit", limit.toString());
  if (offset !== undefined) search.set("offset", offset.toString());

  const query = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetch(`/api/v1/operator/orders${query}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Operator order request failed with status ${response.status}`);
  }

  return response.json() as Promise<OperatorOrderPage>;
}

export async function getOperatorOrder({ orderId, signal }: GetOperatorOrderParameters): Promise<OperatorOrderDetail> {
  const response = await fetch(`/api/v1/operator/orders/${encodeURIComponent(orderId)}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Operator order detail request failed with status ${response.status}`);
  }

  return response.json() as Promise<OperatorOrderDetail>;
}

export async function getOperatorOrderSearchProjectionStatus({
  signal,
}: GetOperatorOrderSearchProjectionStatusParameters = {}): Promise<OperatorOrderSearchProjectionStatus> {
  const response = await fetch("/api/v1/operator/orders/search/status", {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Operator order search projection status request failed with status ${response.status}`);
  }

  return response.json() as Promise<OperatorOrderSearchProjectionStatus>;
}

export async function searchOperatorOrders({
  q,
  sourceSystem,
  externalOrderId,
  status,
  currency,
  sku,
  receivedAtFrom,
  receivedAtBefore,
  limit,
  offset,
  signal,
}: SearchOperatorOrdersParameters = {}): Promise<OperatorOrderSearchPage> {
  const search = new URLSearchParams();
  const parameters = {
    q,
    sourceSystem,
    externalOrderId,
    status,
    currency,
    sku,
    receivedAtFrom,
    receivedAtBefore,
    limit,
    offset,
  };

  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) search.set(name, value.toString());
  }

  const query = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetch(`/api/v1/operator/orders/search${query}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new IntegrationCoreApiError(response.status, await readProblem(response));
  }

  return response.json() as Promise<OperatorOrderSearchPage>;
}

export async function receiveOrder({
  request,
  sourceApiKey,
  correlationId,
  signal,
}: ReceiveOrderParameters): Promise<ReceiveOrderResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Source-API-Key": sourceApiKey,
  };
  if (correlationId !== undefined) headers["X-Correlation-ID"] = correlationId;

  const response = await fetch("/api/v1/orders", {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw new IntegrationCoreApiError(response.status, await readProblem(response));
  }

  return {
    order: (await response.json()) as ReceiveOrderResponse,
    outcome: response.status === 201 ? "CREATED" : "REPLAYED",
  };
}

async function readProblem(response: Response): Promise<IntegrationCoreProblem | undefined> {
  if (!response.headers.get("Content-Type")?.includes("application/problem+json")) return undefined;

  try {
    return (await response.json()) as IntegrationCoreProblem;
  } catch {
    return undefined;
  }
}
