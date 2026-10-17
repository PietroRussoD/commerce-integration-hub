import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  IntegrationCoreApiError,
  getOperatorOrderSearchProjectionStatus,
  listOperatorOrders,
  searchOperatorOrders,
} from "../../api/integrationCoreClient";
import { AccessTokenProvider } from "../../auth/AccessTokenProvider";
import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { OrdersPage } from "./OrdersPage";

vi.mock("../../api/integrationCoreClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/integrationCoreClient")>(),
  getOperatorOrderSearchProjectionStatus: vi.fn(),
  listOperatorOrders: vi.fn(),
  searchOperatorOrders: vi.fn(),
}));

const getOperatorOrderSearchProjectionStatusMock = vi.mocked(getOperatorOrderSearchProjectionStatus);
const listOperatorOrdersMock = vi.mocked(listOperatorOrders);
const searchOperatorOrdersMock = vi.mocked(searchOperatorOrders);

beforeEach(() => {
  getOperatorOrderSearchProjectionStatusMock.mockResolvedValue({
    consumerEnabled: true,
    readAlias: "orders-read",
    availability: "AVAILABLE",
    lastProjectedEventOccurredAt: "2026-09-08T08:00:01Z",
    lastProjectedAt: "2026-09-08T08:00:01.250Z",
    lastProjectionProcessingDelayMilliseconds: 250,
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
  searchOperatorOrdersMock.mockReset();
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
  const diagnostics = screen.getByText("Show technical details");
  const diagnosticDetails = diagnostics.closest("details");
  expect(diagnosticDetails).not.toHaveAttribute("open");
  expect(screen.getByText("Available")).toBeInTheDocument();
  fireEvent.click(diagnostics);
  expect(diagnosticDetails).toHaveAttribute("open", "");
  expect(screen.getByRole("heading", { name: "Search projection" })).toBeInTheDocument();
  expect(screen.getByText("orders-read")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Projection progress" })).toBeInTheDocument();
  expect(screen.getByText("250 ms")).toBeInTheDocument();
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

test("searches projected orders only after an explicit submission", async () => {
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  searchOperatorOrdersMock.mockResolvedValue({
    items: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
        aggregateVersion: 2,
        sourceSystem: "MARKETPLACE_A",
        externalOrderId: "SEARCH-42",
        status: "READY",
        currency: "EUR",
        totalAmount: "39.98",
        receivedAt: "2026-09-08T08:00:00Z",
        readyAt: "2026-09-08T08:00:05Z",
        itemSkus: ["SKU-42"],
        itemDescriptions: ["Blue shirt"],
      },
    ],
    limit: 25,
    offset: 0,
    total: 1,
  });
  renderOrdersPage();

  expect(searchOperatorOrdersMock).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search projected orders" })).toBeEnabled());
  fireEvent.change(screen.getByRole("searchbox", { name: "Search projected orders" }), { target: { value: "blue" } });
  fireEvent.click(screen.getByRole("button", { name: "Search projected orders" }));

  expect(await screen.findByText("SEARCH-42")).toBeInTheDocument();
  expect(screen.getByText("Blue shirt")).toBeInTheDocument();
  expect(searchOperatorOrdersMock).toHaveBeenCalledWith(expect.objectContaining({ q: "blue", limit: 25 }));
});

test("clears the active projected order search without another request", async () => {
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  searchOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  renderOrdersPage();

  const searchbox = screen.getByRole("searchbox", { name: "Search projected orders" });
  await waitFor(() => expect(searchbox).toBeEnabled());
  fireEvent.change(searchbox, { target: { value: "blue" } });
  fireEvent.click(screen.getByRole("button", { name: "Search projected orders" }));
  expect(await screen.findByText("No projected orders found")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Complete order list" }));

  expect(searchbox).toHaveValue("");
  expect(screen.queryByText("No projected orders found")).not.toBeInTheDocument();
  expect(searchOperatorOrdersMock).toHaveBeenCalledTimes(1);
});

test("searches projected orders by exact external order ID and SKU", async () => {
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  searchOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  renderOrdersPage();

  await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search projected orders" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Toggle search filters" }));
  fireEvent.change(screen.getByRole("textbox", { name: "External order ID" }), { target: { value: " ORDER-42 " } });
  fireEvent.change(screen.getByRole("textbox", { name: "SKU" }), { target: { value: " SKU-42 " } });
  fireEvent.click(screen.getByRole("button", { name: "Search projected orders" }));

  await waitFor(() => {
    expect(searchOperatorOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ externalOrderId: "ORDER-42", sku: "SKU-42", limit: 25 }),
    );
  });
});

test("does not submit projected order searches while the projection is unavailable", async () => {
  getOperatorOrderSearchProjectionStatusMock.mockResolvedValue({
    consumerEnabled: false,
    readAlias: "orders-read",
    availability: "UNAVAILABLE",
    lastProjectedEventOccurredAt: null,
    lastProjectedAt: null,
    lastProjectionProcessingDelayMilliseconds: null,
    reconciliationInProgress: false,
    lastReconciliationCompletedAt: null,
    lastReconciliationScannedCount: null,
    lastReconciliationAppliedCount: null,
    lastReconciliationIgnoredCount: null,
    reindex: {
      phase: "IDLE",
      sourceIndex: null,
      candidateIndex: null,
      scannedCount: 0,
      appliedCount: 0,
      ignoredNonNewerVersionCount: 0,
    },
  });
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  renderOrdersPage();

  expect(await screen.findByText("Projected order search is unavailable")).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search projected orders" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Search projected orders" })).toBeDisabled();
  expect(searchOperatorOrdersMock).not.toHaveBeenCalled();
});

test("paginates the active projected search without paging the complete list", async () => {
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  searchOperatorOrdersMock
    .mockResolvedValueOnce({
      items: [
        {
          id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
          aggregateVersion: 1,
          sourceSystem: "MARKETPLACE_A",
          externalOrderId: "SEARCH-PAGE-1",
          status: "READY",
          currency: "EUR",
          totalAmount: "39.98",
          receivedAt: "2026-09-08T08:00:00Z",
          readyAt: "2026-09-08T08:00:05Z",
          itemSkus: ["SKU-1"],
          itemDescriptions: ["Blue shirt"],
        },
      ],
      limit: 25,
      offset: 0,
      total: 26,
    })
    .mockResolvedValueOnce({
      items: [
        {
          id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f89",
          aggregateVersion: 1,
          sourceSystem: "MARKETPLACE_A",
          externalOrderId: "SEARCH-PAGE-2",
          status: "READY",
          currency: "EUR",
          totalAmount: "39.98",
          receivedAt: "2026-09-08T08:00:00Z",
          readyAt: "2026-09-08T08:00:05Z",
          itemSkus: ["SKU-2"],
          itemDescriptions: ["Blue shirt"],
        },
      ],
      limit: 25,
      offset: 25,
      total: 26,
    });
  renderOrdersPage();

  await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search projected orders" })).toBeEnabled());
  fireEvent.change(screen.getByRole("searchbox", { name: "Search projected orders" }), { target: { value: "blue" } });
  fireEvent.click(screen.getByRole("button", { name: "Search projected orders" }));
  expect(await screen.findByText("SEARCH-PAGE-1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Next page" }));

  expect(await screen.findByText("SEARCH-PAGE-2")).toBeInTheDocument();
  expect(searchOperatorOrdersMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "blue", limit: 25, offset: 25 }));
  expect(listOperatorOrdersMock).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
});

test("uses the search scope for status, count and refresh while keeping draft edits unapplied", async () => {
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 300 });
  searchOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 25, total: 27 });
  renderOrdersPage("en", "/orders?status=RECEIVED&q=blue&searchOffset=25");

  expect(await screen.findByText("Indexed search · Total: 27")).toBeInTheDocument();
  expect(listOperatorOrdersMock).not.toHaveBeenCalled();
  expect(searchOperatorOrdersMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "blue", status: "RECEIVED", offset: 25 }));
  const searchbox = screen.getByRole("searchbox", { name: "Search projected orders" });
  fireEvent.change(searchbox, { target: { value: "red" } });
  expect(screen.getByText("Applied criteria: Description: blue")).toBeInTheDocument();
  expect(screen.getByText(/The fields have changed/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh orders" }));
  await waitFor(() => expect(searchOperatorOrdersMock).toHaveBeenCalledTimes(2));
  expect(searchOperatorOrdersMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "blue", status: "RECEIVED", offset: 25 }));
  expect(getOperatorOrderSearchProjectionStatusMock).toHaveBeenCalledTimes(2);
  expect(listOperatorOrdersMock).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "READY" } });
  await waitFor(() => expect(searchOperatorOrdersMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "blue", status: "READY", offset: 0 })));
  expect(searchbox).toHaveValue("red");
});

test.each(["unavailable", "error"])("keeps an unavailable search distinct and permits returning to the complete list: %s", async (failure) => {
  if (failure === "error") getOperatorOrderSearchProjectionStatusMock.mockRejectedValue(new Error("unavailable"));
  else {
    const status = await getOperatorOrderSearchProjectionStatusMock();
    getOperatorOrderSearchProjectionStatusMock.mockResolvedValue({ ...status, availability: "UNAVAILABLE" });
    getOperatorOrderSearchProjectionStatusMock.mockClear();
  }
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  renderOrdersPage("en", "/orders?status=READY&q=blue&offset=25&searchOffset=25");
  expect(await screen.findByText("Projected order search is unavailable")).toBeInTheDocument();
  expect(screen.getByText("Indexed search")).toBeInTheDocument();
  expect(screen.queryByText("No orders found")).not.toBeInTheDocument();
  expect(searchOperatorOrdersMock).not.toHaveBeenCalled();
  expect(listOperatorOrdersMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Complete order list" }));
  expect(await screen.findByText("No orders found")).toBeInTheDocument();
  expect(screen.getByText("Complete order list · Total: 0")).toBeInTheDocument();
  expect(listOperatorOrdersMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: "READY", offset: 0 }));
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
  searchOperatorOrdersMock.mockResolvedValue({
    items: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
        aggregateVersion: 2,
        sourceSystem: "MARKETPLACE_A",
        externalOrderId: "RICERCA-42",
        status: "READY",
        currency: "EUR",
        totalAmount: "39.98",
        receivedAt: "2026-09-08T08:00:00Z",
        readyAt: "2026-09-08T08:00:05Z",
        itemSkus: ["SKU-42"],
        itemDescriptions: ["Maglia blu"],
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

  await waitFor(() => expect(screen.getByRole("searchbox", { name: "Cerca negli ordini indicizzati" })).toBeEnabled());
  fireEvent.change(screen.getByRole("searchbox", { name: "Cerca negli ordini indicizzati" }), { target: { value: "blu" } });
  fireEvent.click(screen.getByRole("button", { name: "Cerca negli ordini indicizzati" }));

  expect(await screen.findByText("RICERCA-42")).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /RICERCA-42.*Pronto/i })).toBeInTheDocument();
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

test.each([
  [401, "en", "Access to orders requires an operator token accepted by the Core"],
  [403, "en", "The Core denied access to orders"],
  [401, "it", "Per accedere agli ordini serve un token operatore accettato dal Core"],
  [403, "it", "Il Core ha negato l’accesso agli ordini"],
] as const)("explains Core %i in %s without retrying protected reads", async (status, locale, message) => {
  listOperatorOrdersMock.mockRejectedValue(new IntegrationCoreApiError(status));
  getOperatorOrderSearchProjectionStatusMock.mockRejectedValue(new IntegrationCoreApiError(status));
  renderOrdersPage(locale);

  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
  for (const alert of screen.getAllByRole("alert")) expect(alert).toHaveTextContent(message);
  expect(screen.queryByRole("button", { name: locale === "it" ? "Riprova" : "Retry" })).not.toBeInTheDocument();
  expect(listOperatorOrdersMock).toHaveBeenCalledTimes(1);
  expect(getOperatorOrderSearchProjectionStatusMock).toHaveBeenCalledTimes(1);
});

test.each([401, 403])("explains projected search %i without a retry action", async (status) => {
  listOperatorOrdersMock.mockResolvedValue({ items: [], limit: 25, offset: 0, total: 0 });
  searchOperatorOrdersMock.mockRejectedValue(new IntegrationCoreApiError(status));
  renderOrdersPage();
  const searchbox = screen.getByRole("searchbox", { name: "Search projected orders" });
  await waitFor(() => expect(searchbox).toBeEnabled());
  fireEvent.change(searchbox, { target: { value: "blue" } });
  fireEvent.click(screen.getByRole("button", { name: "Search projected orders" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(status === 401
    ? "Access to orders requires an operator token accepted by the Core"
    : "The Core denied access to orders");
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  expect(searchOperatorOrdersMock).toHaveBeenCalledTimes(1);
});

function renderOrdersPage(locale: SupportedLocale = "en", initialUrl = "/orders") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });

  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <MemoryRouter initialEntries={[initialUrl]}>
        <TestProviders queryClient={queryClient}>
          <OrdersPage />
        </TestProviders>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function TestProviders({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  return <QueryClientProvider client={queryClient}><AccessTokenProvider>{children}</AccessTokenProvider></QueryClientProvider>;
}
