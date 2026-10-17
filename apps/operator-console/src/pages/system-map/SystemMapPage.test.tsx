import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test } from "vitest";

import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { SystemMapPage } from "./SystemMapPage";

afterEach(cleanup);

test("renders the implemented integration topology", () => {
  renderPage();

  expect(screen.getByRole("heading", { name: "System Map" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Order ingestion and processing" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Connector Gateway" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: "OpenSearch" })).not.toHaveLength(0);
  expect(screen.getByRole("heading", { name: "Operator and observability surfaces" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Runtime touchpoints" })).toBeInTheDocument();
  expect(screen.getByText("Canonical HTTP command")).toBeInTheDocument();
  expect(screen.getByText("Calls the Core API")).toBeInTheDocument();
});

test("describes runtime connections in the direction of the caller", () => {
  renderPage();

  const runtimeTouchpoints = screen.getByRole("heading", { name: "Runtime touchpoints" }).parentElement;
  expect(runtimeTouchpoints).not.toBeNull();
  const withinTouchpoints = within(runtimeTouchpoints!);

  expect(withinTouchpoints.getByRole("group", { name: "Operator Console — Calls the Core API — Integration Core" })).toBeInTheDocument();
  expect(withinTouchpoints.getByRole("group", { name: "Operator Console — Calls the Gateway API — Connector Gateway" })).toBeInTheDocument();
  expect(withinTouchpoints.getByRole("group", { name: "Connector Gateway — Requests provider pages — Provider Simulator" })).toBeInTheDocument();
  expect(withinTouchpoints.getByRole("group", { name: "Prometheus — Scrapes /metrics endpoints — Integration Core and Connector Gateway" })).toBeInTheDocument();
  expect(withinTouchpoints.getByRole("group", { name: "Grafana — Queries Prometheus for dashboards — Prometheus" })).toBeInTheDocument();
});

test("renders translated system map content", () => {
  renderPage("it");

  expect(screen.getByRole("heading", { name: "Mappa del sistema" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Acquisizione ed elaborazione ordini" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Connector Gateway" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Connector Gateway — Richiede le pagine al provider — Simulatore del provider" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Prometheus — Esegue lo scrape degli endpoint /metrics — Integration Core e Connector Gateway" })).toBeInTheDocument();
});

test("shows the selected component's architecture details", () => {
  renderPage();

  expect(
    within(screen.getByRole("complementary", { name: "Integration Core" })).getByText(
      "Owns canonical order validation, idempotency, the workflow and the transactional outbox.",
    ),
  ).toBeInTheDocument();
  expect(within(screen.getByRole("complementary", { name: "Integration Core" })).getByRole("link", { name: "Open technical reference" })).toHaveAttribute(
    "href",
    "https://github.com/PietroRussoD/commerce-integration-hub/blob/main/services/integration-core/README.md#architecture",
  );

  fireEvent.click(screen.getByRole("button", { name: /Connector Gateway/ }));

  expect(
    within(screen.getByRole("complementary", { name: "Connector Gateway" })).getByText(
      "Protects the core from provider-specific protocols and preserves recoverable delivery state.",
    ),
  ).toBeInTheDocument();
  expect(within(screen.getByRole("complementary", { name: "Connector Gateway" })).getByRole("link", { name: "Open technical reference" })).toHaveAttribute(
    "href",
    "https://github.com/PietroRussoD/commerce-integration-hub/blob/main/services/connector-gateway/README.md",
  );
  expect(screen.getByRole("button", { name: /Connector Gateway/ })).toHaveAttribute("aria-pressed", "true");
});

test("has no automatically detectable accessibility violations", async () => {
  const { container } = renderPage();

  await expectNoAccessibilityViolations(container);
});

function renderPage(locale: SupportedLocale = "en") {
  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <SystemMapPage />
    </I18nextProvider>,
  );
}
