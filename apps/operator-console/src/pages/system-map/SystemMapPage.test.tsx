import { cleanup, render, screen } from "@testing-library/react";
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
  expect(screen.getByRole("heading", { name: "OpenSearch" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Operator and observability surfaces" })).toBeInTheDocument();
});

test("renders translated system map content", () => {
  renderPage("it");

  expect(screen.getByRole("heading", { name: "Mappa del sistema" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Acquisizione ed elaborazione ordini" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Connector Gateway" })).toBeInTheDocument();
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
