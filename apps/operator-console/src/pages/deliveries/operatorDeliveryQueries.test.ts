import { expect, test } from "vitest";

import { ConnectorGatewayApiError } from "../../api/connectorGatewayClient";
import { operatorDeliveryRequestFailure, retryOperatorDeliveryQuery } from "./operatorDeliveryQueries";

test.each([[400, "invalidRequest"], [404, "notFound"]] as const)(
  "classifies permanent Gateway response %i and does not retry it",
  (status, failure) => {
    const error = new ConnectorGatewayApiError(status);
    expect(operatorDeliveryRequestFailure(error)).toBe(failure);
    expect(retryOperatorDeliveryQuery(0, error)).toBe(false);
  },
);

test("keeps one retry for a transient Gateway failure", () => {
  const error = new ConnectorGatewayApiError(503);
  expect(operatorDeliveryRequestFailure(error)).toBeUndefined();
  expect(retryOperatorDeliveryQuery(0, error)).toBe(true);
});
