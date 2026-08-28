import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { getOperatorOrder, type OperatorOrderDetail } from "../../api/integrationCoreClient";
import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { OrderDetailPage } from "./OrderDetailPage";

vi.mock("../../api/integrationCoreClient", () => ({
  getOperatorOrder: vi.fn(),
}));

const getOperatorOrderMock = vi.mocked(getOperatorOrder);
const orderDetail: OperatorOrderDetail = {
  id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
  sourceSystem: "MARKETPLACE_A",
  externalOrderId: "ORDER-42",
  status: "READY",
  currency: "EUR",
  totalAmount: "39.98",
  receivedAt: "2026-08-21T08:00:00Z",
  items: [
    {
      externalLineId: "LINE-1",
      sku: "SKU-1",
      description: "Example item",
      quantity: "2",
      unitPrice: "19.99",
      lineAmount: "39.98",
      position: 1,
    },
  ],
  timeline: [],
  processingAttempts: [],
};

afterEach(() => {
  cleanup();
  getOperatorOrderMock.mockReset();
});

test("renders the operator order summary returned by the API", async () => {
  getOperatorOrderMock.mockResolvedValue(orderDetail);

  renderOrderDetailPage();

  expect(await screen.findByText("ORDER-42")).toBeInTheDocument();
  expect(screen.getByText("Marketplace A")).toBeInTheDocument();
  expect(screen.getByText("Ready")).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /LINE-1 SKU-1 Example item 2/i })).toBeInTheDocument();
  expect(getOperatorOrderMock).toHaveBeenCalledWith(
    expect.objectContaining({ orderId: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88" }),
  );
});

test("renders the empty item state", async () => {
  getOperatorOrderMock.mockResolvedValue({ ...orderDetail, items: [] });

  renderOrderDetailPage();

  expect(await screen.findByText("No order items")).toBeInTheDocument();
});

test("renders timeline events in API order", async () => {
  getOperatorOrderMock.mockResolvedValue({
    ...orderDetail,
    timeline: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9001",
        eventType: "ORDER_RECEIVED",
        fromStatus: null,
        toStatus: "RECEIVED",
        message: "Canonical order accepted",
        correlationId: "018f38c2-1b95-7cc4-bb89-72d26a6f9101",
        occurredAt: "2026-08-21T08:00:00Z",
      },
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9002",
        eventType: "PROCESSING_STARTED",
        fromStatus: "RECEIVED",
        toStatus: "PROCESSING",
        message: null,
        correlationId: "018f38c2-1b95-7cc4-bb89-72d26a6f9102",
        occurredAt: "2026-08-21T08:00:01Z",
      },
    ],
  });

  renderOrderDetailPage();

  const events = await screen.findAllByRole("listitem");
  expect(events).toHaveLength(2);
  expect(events[0]).toHaveTextContent("Order received");
  expect(events[0]).toHaveTextContent("Entered Received");
  expect(events[1]).toHaveTextContent("Processing started");
  expect(events[1]).toHaveTextContent("Received to Processing");
});

test("renders the empty timeline state", async () => {
  getOperatorOrderMock.mockResolvedValue(orderDetail);

  renderOrderDetailPage();

  expect(await screen.findByText("No timeline events")).toBeInTheDocument();
});

test("renders processing attempts and failures", async () => {
  getOperatorOrderMock.mockResolvedValue({
    ...orderDetail,
    processingAttempts: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9201",
        attemptNumber: 1,
        status: "FAILED",
        trigger: "INITIAL",
        errorCode: "PROVIDER_TIMEOUT",
        errorMessage: "Provider did not respond before the deadline",
        startedAt: "2026-08-21T08:00:00Z",
        completedAt: "2026-08-21T08:00:01.250Z",
      },
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9202",
        attemptNumber: 2,
        status: "STARTED",
        trigger: "MANUAL_RETRY",
        errorCode: null,
        errorMessage: null,
        startedAt: "2026-08-21T08:01:00Z",
        completedAt: null,
      },
    ],
  });

  renderOrderDetailPage();

  expect(await screen.findByRole("row", { name: /1 Initial Failed.*1\.3 s PROVIDER_TIMEOUT/i })).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /2 Manual retry Started.*In progress/i })).toBeInTheDocument();
});

test("renders the empty processing-attempt state", async () => {
  getOperatorOrderMock.mockResolvedValue(orderDetail);

  renderOrderDetailPage();

  expect(await screen.findByText("No processing attempts")).toBeInTheDocument();
});

test("renders an actionable error state", async () => {
  getOperatorOrderMock.mockRejectedValue(new Error("service unavailable"));

  renderOrderDetailPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load order details");
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});

test("renders order details using the Italian locale", async () => {
  getOperatorOrderMock.mockResolvedValue({
    ...orderDetail,
    timeline: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9002",
        eventType: "PROCESSING_SUCCEEDED",
        fromStatus: "PROCESSING",
        toStatus: "READY",
        message: null,
        correlationId: "018f38c2-1b95-7cc4-bb89-72d26a6f9102",
        occurredAt: "2026-08-21T08:00:01Z",
      },
    ],
    processingAttempts: [
      {
        id: "018f38c2-1b95-7cc4-bb89-72d26a6f9201",
        attemptNumber: 1,
        status: "FAILED",
        trigger: "MANUAL_RETRY",
        errorCode: "PROVIDER_TIMEOUT",
        errorMessage: "Provider did not respond before the deadline",
        startedAt: "2026-08-21T08:00:00Z",
        completedAt: "2026-08-21T08:00:01.250Z",
      },
    ],
  });

  renderOrderDetailPage("it");

  expect(screen.getByRole("heading", { name: "Dettagli ordine" })).toBeInTheDocument();
  expect(await screen.findByText("ORDER-42")).toBeInTheDocument();
  expect(screen.getByText("Pronto")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Articoli dell'ordine" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Prezzo unitario" })).toBeInTheDocument();
  expect(screen.getAllByText(/19,99|39,98/)).not.toHaveLength(0);
  expect(screen.getByRole("heading", { name: "Cronologia" })).toBeInTheDocument();
  expect(screen.getByRole("listitem")).toHaveTextContent("Elaborazione completata");
  expect(screen.getByRole("listitem")).toHaveTextContent("Da In elaborazione a Pronto");
  expect(screen.getByRole("row", { name: /1 Nuovo tentativo manuale Non riuscito.*1,3 s PROVIDER_TIMEOUT/i })).toBeInTheDocument();
});

function renderOrderDetailPage(locale: SupportedLocale = "en") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <MemoryRouter initialEntries={["/orders/018f38c2-1b95-7cc4-bb89-72d26a6f9f88"]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}
