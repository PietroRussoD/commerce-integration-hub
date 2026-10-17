import { IntegrationCoreApiError } from "../../api/integrationCoreClient";

export function operatorOrderAccessFailure(error: unknown): "unauthorized" | "forbidden" | undefined {
  if (!(error instanceof IntegrationCoreApiError)) return undefined;
  if (error.status === 401) return "unauthorized";
  if (error.status === 403) return "forbidden";
  return undefined;
}

export function operatorOrderRequestFailure(error: unknown): "invalidRequest" | "notFound" | undefined {
  if (!(error instanceof IntegrationCoreApiError)) return undefined;
  if (error.status === 400) return "invalidRequest";
  if (error.status === 404) return "notFound";
  return undefined;
}

export function retryOperatorOrderQuery(failureCount: number, error: unknown): boolean {
  return operatorOrderAccessFailure(error) === undefined && operatorOrderRequestFailure(error) === undefined && failureCount < 1;
}
