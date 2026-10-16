import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { getOperatorDelivery } from "../../api/connectorGatewayClient";
import { AppProviders } from "../../app/AppProviders";
import { createAppRoutes } from "../../app/router";
import { AccessTokenContext, type AccessTokenContextValue } from "../../auth/accessTokenContext";

vi.mock("../../api/connectorGatewayClient", () => ({
  getOperatorDelivery: vi.fn(),
  listOperatorDeliveries: vi.fn(),
}));

const mockedGetOperatorDelivery = vi.mocked(getOperatorDelivery);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

test("does not query a delivery without an operator token", async () => {
  renderDeliveryDetail(noAccessTokenContext);

  expect(await screen.findByRole("alert")).toHaveTextContent("An operator access token is required to inspect deliveries.");
  expect(mockedGetOperatorDelivery).not.toHaveBeenCalled();
});

test("renders the payload retention metadata and safe attempt history", async () => {
  vi.stubEnv("VITE_JAEGER_UI_URL", "http://localhost:16686");
  mockedGetOperatorDelivery.mockResolvedValue({
    attemptCount: 2,
    attempts: [
      {
        attemptId: "e09e6770-117f-4c6b-8f9d-2dc8bf1f7b70",
        attemptNumber: 2,
        completedAt: "2026-09-12T12:05:01Z",
        durationMilliseconds: 1_250,
        errorCode: "CORE_UNAVAILABLE",
        httpStatus: 503,
        outcome: "RETRYABLE_FAILURE",
        safeErrorMessage: "The Core endpoint did not respond before the timeout",
        startedAt: "2026-09-12T12:05:00Z",
        traceId: "0123456789abcdef0123456789abcdef",
      },
    ],
    completedAt: null,
    connectorId: "3a224e92-4a6b-4e73-ae04-d7f8042e8bbb",
    connectorMode: "POLLING",
    connectorStatus: "ACTIVE",
    correlationId: "b374867a-07c4-4d82-a438-a04301731707",
    deliveryId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21",
    errorCode: "CORE_UNAVAILABLE",
    externalEventId: "event-42",
    lastCoreOrderId: null,
    lastHttpStatus: 503,
    mappingVersion: "erp-b-v2",
    nextAttemptAt: "2026-09-12T12:10:00Z",
    payloadExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    payloadRetained: true,
    provider: "ERP_B",
    receivedAt: "2026-09-12T12:00:00Z",
    safeErrorMessage: "The Core endpoint did not respond before the timeout",
    sourceSystem: "ERP_B",
    status: "EXHAUSTED",
    updatedAt: "2026-09-12T12:05:01Z",
  });

  renderDeliveryDetail(operatorAccessTokenContext);

  expect(await screen.findByText("event-42")).toBeInTheDocument();
  expect(screen.getByText(/Retained until/)).toBeInTheDocument();
  expect(screen.getByText("Retryable failure")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open trace 0123456789abcdef0123456789abcdef in Jaeger" })).toHaveAttribute(
    "href",
    "http://localhost:16686/trace/0123456789abcdef0123456789abcdef",
  );
  expect(screen.getByRole("button", { name: "Request a new send attempt" })).toBeInTheDocument();
  expect(screen.getAllByText("The Core endpoint did not respond before the timeout")).toHaveLength(2);
  expect(mockedGetOperatorDelivery).toHaveBeenCalledWith({
    accessToken: "operator-token",
    deliveryId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21",
    signal: expect.any(AbortSignal),
  });
});

function renderDeliveryDetail(contextValue: AccessTokenContextValue) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ["/deliveries/c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21"],
  });

  return render(
    <AppProviders>
      <AccessTokenContext.Provider value={contextValue}>
        <RouterProvider router={router} />
      </AccessTokenContext.Provider>
    </AppProviders>,
  );
}

const noAccessTokenContext: AccessTokenContextValue = {
  cacheScope: "test-session",
  accessToken: undefined,
  clearAccessToken: vi.fn(),
  identity: undefined,
  setAccessToken: vi.fn(),
};

const operatorAccessTokenContext: AccessTokenContextValue = {
  cacheScope: "test-session",
  accessToken: "operator-token",
  clearAccessToken: vi.fn(),
  identity: {
    expiresAt: new Date("2027-01-15T08:00:00Z"),
    roles: new Set(["platform-admin"]),
    subject: "operator-42",
  },
  setAccessToken: vi.fn(),
};
