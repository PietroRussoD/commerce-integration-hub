import { expect, test } from "vitest";

import { IntegrationCoreApiError } from "../../api/integrationCoreClient";
import { operatorOrderAccessFailure, operatorOrderRequestFailure, retryOperatorOrderQuery } from "./operatorOrderQueries";

test.each([[401, "unauthorized"], [403, "forbidden"]] as const)(
  "classifies %i and does not retry it",
  (status, failure) => {
    const error = new IntegrationCoreApiError(status);
    expect(operatorOrderAccessFailure(error)).toBe(failure);
    expect(retryOperatorOrderQuery(0, error)).toBe(false);
  },
);

test.each([new IntegrationCoreApiError(503), new Error("Network unavailable"), null])(
  "keeps one retry for other failures: %s",
  (error) => {
    expect(operatorOrderAccessFailure(error)).toBeUndefined();
    expect(retryOperatorOrderQuery(0, error)).toBe(true);
    expect(retryOperatorOrderQuery(1, error)).toBe(false);
  },
);

test.each([[400, "invalidRequest"], [404, "notFound"]] as const)(
  "classifies permanent Core response %i and does not retry it",
  (status, failure) => {
    const error = new IntegrationCoreApiError(status);
    expect(operatorOrderRequestFailure(error)).toBe(failure);
    expect(retryOperatorOrderQuery(0, error)).toBe(false);
  },
);
