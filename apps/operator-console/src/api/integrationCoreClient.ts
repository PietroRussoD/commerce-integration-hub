import type { paths } from "./generated/integration-core";

export type OperatorOrderPage =
  paths["/api/v1/operator/orders"]["get"]["responses"]["200"]["content"]["application/json"];

export type OperatorOrderDetail =
  paths["/api/v1/operator/orders/{orderId}"]["get"]["responses"]["200"]["content"]["application/json"];

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
