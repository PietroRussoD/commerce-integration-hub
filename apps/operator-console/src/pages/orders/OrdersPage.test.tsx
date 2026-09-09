import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { getOperatorOrderSearchProjectionStatus, listOperatorOrders } from "../../api/integrationCoreClient";
import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { OrdersPage } from "./OrdersPage";

vi.mock("../../api/integrationCoreClient", () => ({
  getOperatorOrderSearchProjectionStatus: vi.fn(),
  listOperatorOrders: vi.fn(),
}));

const getOperatorOrderSearchProjectionStatusMock = vi.mocked(getOperatorOrderSearchProjectionStatus);
const listOperatorOrdersMock = vi.mocked(listOperatorOrders);

beforeEach(() => {
  getOperatorOrderSearchProjectionStatusMock.mockResolvedValue({
    consumerEnabled: true,
    readAlias: "orders-read",
    availability: "AVAILABLE",
    reconciliationInProgress: false,
    lastReconciliationCompletedAt: "2026-09-08T08:00:00Z",
    lastReconciliationScannedCount: 20,
    lastReconciliationAppliedCount: 3,
    lastReconciliationIgnoredCount: 17,
    reindex: {
      phase: "IDLE",
      sourceIndex: null,
      candidateIndex: null,
      scannedCount: 0,
      appliedCount: 0,
      ignoredNonNewerVersionCount: 0,
    },
  });
});

afterEach(() => {
  cleanup();
  getOperatorOrderSearchProjectionStatusMock.mockReset();
  listOperatorOrdersMock.mockReset();
});

test("renders operator order summaries returned by the API", async () => {
  listOperatorOrdersMock.mockResolvedValue({
    items: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
        sourceSystem: "MARKETPLACE_A",
        externalOrderId: "ORDER-42",
        status: "READY",
        currency: "EUR",
        totalAmount: "39.98",
        receivedAt: "2026-08-21T08:00:00Z",
        lastEventAt: "2026-08-21T08:00:05Z",
        processingAttempts: 2,
      },
    ],
    limit: 25,
    offset: 0,
    total: 1,
  });

  renderOrdersPage();

  expect(await screen.findByText("ORDER-42")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "ORDER-42" })).toHaveAttribute(
    "href",
    "/orders/018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
  );
  expect(screen.getByText("Marketplace A")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Search projection" })).toBeInTheDocument();
  expect(screen.getByText("Available")).toBeInTheDocument();
  expect(screen.getByText("orders-read")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Reindex" })).toBeInTheDocument();
  expect(screen.getAllByText("Idle")).toHaveLength(1);
  expect(screen.getByRole("row", { name: /ORDER-42.*Ready/i })).toBeInTheDocument();
  expect(screen.getByText("1-1 of 1")).toBeInTheDocument();
  expect(listOperatorOrdersMock).toHaveBeenCalledWith(
    expect.objectContaining({ status: undefined, limit: 25, offset: 0 }),
  );
});

test("requests a new first page when the status filter changes", async () => {
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  renderOrdersPage();

  await screen.findByText("No orders found");
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "READY" } });

  await waitFor(() => {
    expect(listOperatorOrdersMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "READY", limit: 25, offset: 0 }),
    );
  });
});

test("renders the empty state", async () => {
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  renderOrdersPage();

  expect(await screen.findByText("No orders found")).toBeInTheDocument();
});

test("renders an actionable error state", async () => {
  listOperatorOrdersMock.mockRejectedValue(new Error("service unavailable"));
  renderOrdersPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load orders");
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});

test("renders translated labels and locale-aware values in Italian", async () => {
  listOperatorOrdersMock.mockResolvedValue({
    items: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
        sourceSystem: "MARKETPLACE_A",
        externalOrderId: "ORDER-42",
        status: "READY",
        currency: "EUR",
        totalAmount: "39.98",
        receivedAt: "2026-08-21T08:00:00Z",
        lastEventAt: "2026-08-21T08:00:05Z",
        processingAttempts: 2,
      },
    ],
    limit: 25,
    offset: 0,
    total: 1,
  });

  renderOrdersPage("it");

  expect(screen.getByRole("heading", { name: "Ordini" })).toBeInTheDocument();
  expect(await screen.findByText("ORDER-42")).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Proiezione di ricerca" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Reindicizzazione" })).toBeInTheDocument();
  expect(screen.getByLabelText("Stato")).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /ORDER-42.*Pronto/i })).toBeInTheDocument();
  expect(screen.getByText("1-1 di 1")).toBeInTheDocument();
  expect(screen.getByText(/39,98/)).toBeInTheDocument();
});

test("has no automatically detectable accessibility violations in the loaded order list", async () => {
  listOperatorOrdersMock.mockResolvedValue({
    items: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
        sourceSystem: "MARKETPLACE_A",
        externalOrderId: "ORDER-42",
        status: "READY",
        currency: "EUR",
        totalAmount: "39.98",
        receivedAt: "2026-08-21T08:00:00Z",
        lastEventAt: "2026-08-21T08:00:05Z",
        processingAttempts: 2,
      },
    ],
    limit: 25,
    offset: 0,
    total: 1,
  });

  const { container } = renderOrdersPage();
  expect(await screen.findByText("ORDER-42")).toBeInTheDocument();

  await expectNoAccessibilityViolations(container);
});

function renderOrdersPage(locale: SupportedLocale = "en") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <MemoryRouter>
        <TestProviders queryClient={queryClient}>
          <OrdersPage />
        </TestProviders>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function TestProviders({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
