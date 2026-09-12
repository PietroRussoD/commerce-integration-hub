import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { listOperatorDeliveries } from "../../api/connectorGatewayClient";
import { AppProviders } from "../../app/AppProviders";
import { AccessTokenContext, type AccessTokenContextValue } from "../../auth/accessTokenContext";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { DeliveriesPage } from "./DeliveriesPage";

vi.mock("../../api/connectorGatewayClient", () => ({ listOperatorDeliveries: vi.fn() }));

const mockedListOperatorDeliveries = vi.mocked(listOperatorDeliveries);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("asks for an access token before querying the Gateway", () => {
  renderPage();

  expect(screen.getByRole("alert")).toHaveTextContent("An operator access token is required to inspect deliveries.");
  expect(mockedListOperatorDeliveries).not.toHaveBeenCalled();
});

test("lists deliveries for an operator token", async () => {
  mockedListOperatorDeliveries.mockResolvedValue({
    items: [
      {
        attemptCount: 3,
        completedAt: null,
        correlationId: null,
        deliveryId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21",
        errorCode: "CORE_UNAVAILABLE",
        externalEventId: "event-42",
        lastCoreOrderId: null,
        lastHttpStatus: 503,
        provider: "ERP_B",
        receivedAt: "2026-09-12T12:00:00Z",
        sourceSystem: "ERP_B",
        status: "EXHAUSTED",
        updatedAt: "2026-09-12T12:03:00Z",
      },
    ],
    nextCursor: null,
  });

  renderPage(operatorAccessTokenContext);

  expect(await screen.findByText("event-42")).toBeInTheDocument();
  expect(screen.getByText("Exhausted", { selector: "span" })).toBeInTheDocument();
  expect(mockedListOperatorDeliveries).toHaveBeenCalledWith({
    accessToken: "operator-token",
    cursor: undefined,
    limit: 25,
    provider: undefined,
    signal: expect.any(AbortSignal),
    status: undefined,
  });
});

test("has no automatically detectable accessibility violations without Gateway access", async () => {
  const { container } = renderPage();

  await expectNoAccessibilityViolations(container);
});

function renderPage(contextValue: AccessTokenContextValue = noAccessTokenContext) {
  return render(
    <AppProviders>
      <AccessTokenContext.Provider value={contextValue}>
        <MemoryRouter>
          <DeliveriesPage />
        </MemoryRouter>
      </AccessTokenContext.Provider>
    </AppProviders>,
  );
}

const noAccessTokenContext: AccessTokenContextValue = {
  accessToken: undefined,
  clearAccessToken: vi.fn(),
  identity: undefined,
  setAccessToken: vi.fn(),
};

const operatorAccessTokenContext: AccessTokenContextValue = {
  accessToken: "operator-token",
  clearAccessToken: vi.fn(),
  identity: {
    expiresAt: new Date("2027-01-15T08:00:00Z"),
    roles: new Set(["operator"]),
    subject: "operator-42",
  },
  setAccessToken: vi.fn(),
};
