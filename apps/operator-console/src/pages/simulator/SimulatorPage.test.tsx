import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { IntegrationCoreApiError, receiveOrder } from "../../api/integrationCoreClient";
import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { SimulatorPage } from "./SimulatorPage";

vi.mock("../../api/integrationCoreClient", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/integrationCoreClient")>();
  return { ...original, receiveOrder: vi.fn() };
});

const receiveOrderMock = vi.mocked(receiveOrder);

afterEach(() => {
  cleanup();
  receiveOrderMock.mockReset();
});

test("masks the source API key and lets the operator reveal it", () => {
  renderSimulator();

  const sourceApiKeyInput = screen.getByLabelText("Source API key");
  expect(sourceApiKeyInput).toHaveAttribute("type", "password");

  fireEvent.click(screen.getByRole("button", { name: "Show source API key" }));
  expect(sourceApiKeyInput).toHaveAttribute("type", "text");

  fireEvent.click(screen.getByRole("button", { name: "Hide source API key" }));
  expect(sourceApiKeyInput).toHaveAttribute("type", "password");
});

test("submits a single-item canonical order", async () => {
  receiveOrderMock.mockResolvedValue({
    outcome: "CREATED",
    order: {
      id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
      sourceSystem: "MARKETPLACE_A",
      externalId: "DEMO-ORDER-001",
      currency: "EUR",
      totalAmount: "39.98",
      status: "RECEIVED",
      receivedAt: "2026-08-26T08:00:00Z",
      items: [],
    },
  });
  renderSimulator();

  fireEvent.change(screen.getByLabelText("Source API key"), { target: { value: "key-id.secret" } });
  fireEvent.change(screen.getByLabelText("External order ID"), { target: { value: "DEMO-ORDER-002" } });
  fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "GBP" } });
  fireEvent.change(screen.getByLabelText("Declared total"), { target: { value: "15.00" } });
  fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "DEMO-SKU-002" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "5.00" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));

  await waitFor(() => {
    expect(receiveOrderMock).toHaveBeenCalledWith({
      sourceApiKey: "key-id.secret",
      request: {
        externalId: "DEMO-ORDER-002",
        currency: "GBP",
        declaredTotalAmount: "15.00",
        items: [{ sku: "DEMO-SKU-002", quantity: "3", unitPrice: "5.00" }],
      },
    });
  });
  expect(await screen.findByRole("status")).toHaveTextContent("Order created");
  expect(screen.getByRole("link", { name: "View order" })).toHaveAttribute(
    "href",
    "/orders/018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
  );
});

test("loads replay, conflict, and invalid scenarios from an accepted request", async () => {
  receiveOrderMock.mockResolvedValue({
    outcome: "CREATED",
    order: {
      id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
      sourceSystem: "MARKETPLACE_A",
      externalId: "BASELINE-ORDER",
      currency: "GBP",
      totalAmount: "15.00",
      status: "RECEIVED",
      receivedAt: "2026-08-26T08:00:00Z",
      items: [],
    },
  });
  renderSimulator();

  const replayButton = screen.getByRole("button", { name: "Equivalent replay" });
  const conflictButton = screen.getByRole("button", { name: "Conflict" });
  expect(replayButton).toBeDisabled();
  expect(conflictButton).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Source API key"), { target: { value: "key-id.secret" } });
  fireEvent.change(screen.getByLabelText("External order ID"), { target: { value: "BASELINE-ORDER" } });
  fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "GBP" } });
  fireEvent.change(screen.getByLabelText("Declared total"), { target: { value: "15.00" } });
  fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "BASELINE-SKU" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "5.00" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));

  await waitFor(() => expect(replayButton).toBeEnabled());
  fireEvent.change(screen.getByLabelText("External order ID"), { target: { value: "CHANGED" } });
  fireEvent.click(replayButton);
  expect(screen.getByLabelText("External order ID")).toHaveValue("BASELINE-ORDER");
  expect(screen.getByLabelText("SKU")).toHaveValue("BASELINE-SKU");

  fireEvent.click(conflictButton);
  expect(screen.getByLabelText("External order ID")).toHaveValue("BASELINE-ORDER");
  expect(screen.getByLabelText("Declared total")).toHaveValue("10.00");
  expect(screen.getByLabelText("SKU")).toHaveValue("CONFLICT-SKU");

  fireEvent.click(screen.getByRole("button", { name: "Invalid total" }));
  expect(screen.getByLabelText("External order ID")).not.toHaveValue("BASELINE-ORDER");
  expect(screen.getByLabelText("Declared total")).toHaveValue("39.97");
  expect(screen.getByLabelText("Unit price")).toHaveValue("19.99");

  const invalidExternalId = (screen.getByLabelText("External order ID") as HTMLInputElement).value;
  fireEvent.click(screen.getByRole("button", { name: "Fresh order" }));
  expect(screen.getByLabelText("External order ID")).not.toHaveValue(invalidExternalId);
  expect(screen.getByLabelText("Declared total")).toHaveValue("39.98");
});

test("renders structured validation errors", async () => {
  receiveOrderMock.mockRejectedValue(
    new IntegrationCoreApiError(400, {
      type: "urn:problem:request-validation",
      title: "Request validation failed",
      status: 400,
      detail: "One or more request fields are invalid",
      instance: "/api/v1/orders",
      code: "REQUEST_VALIDATION_FAILED",
      errors: [{ field: "items[0].quantity", message: "must match the decimal format" }],
    }),
  );
  renderSimulator();

  fireEvent.change(screen.getByLabelText("Source API key"), { target: { value: "key-id.secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit order" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("One or more request fields are invalid");
  expect(screen.getByRole("alert")).toHaveTextContent("items[0].quantity");
});

test("renders and submits the simulator in Italian", async () => {
  receiveOrderMock.mockResolvedValue({
    outcome: "CREATED",
    order: {
      id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88",
      sourceSystem: "MARKETPLACE_A",
      externalId: "DEMO-ORDER-001",
      currency: "EUR",
      totalAmount: "39.98",
      status: "RECEIVED",
      receivedAt: "2026-08-26T08:00:00Z",
      items: [],
    },
  });
  renderSimulator("it");

  expect(screen.getByRole("heading", { name: "Simulatore" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Scenari di simulazione" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Chiave API dell'origine"), { target: { value: "key-id.secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Invia ordine" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Ordine creato");
  expect(screen.getByRole("link", { name: "Visualizza ordine" })).toBeInTheDocument();
});

function renderSimulator(locale: SupportedLocale = "en") {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
    },
  });

  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SimulatorPage />
        </QueryClientProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}
