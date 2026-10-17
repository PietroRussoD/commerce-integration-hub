import { ConnectorGatewayApiError } from "../../api/connectorGatewayClient";

export function operatorDeliveryAccessFailure(error: unknown): "unauthorized" | "denied" | undefined {
  if (!(error instanceof ConnectorGatewayApiError)) return undefined;
  if (error.status === 401) return "unauthorized";
  if (error.status === 403) return "denied";
  return undefined;
}

export function operatorDeliveryRequestFailure(error: unknown): "invalidRequest" | "notFound" | undefined {
  if (!(error instanceof ConnectorGatewayApiError)) return undefined;
  if (error.status === 400) return "invalidRequest";
  if (error.status === 404) return "notFound";
  return undefined;
}

export function retryOperatorDeliveryQuery(failureCount: number, error: unknown): boolean {
  return operatorDeliveryAccessFailure(error) === undefined && operatorDeliveryRequestFailure(error) === undefined && failureCount < 1;
}
