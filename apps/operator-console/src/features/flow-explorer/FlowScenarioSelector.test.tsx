import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";

import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { FlowScenarioSelector } from "./FlowScenarioSelector";
import type { FlowTraceScenarioId } from "./flowTrace";

afterEach(cleanup);

test("shows every catalog scenario and marks the selected one", () => {
  renderSelector();

  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect(screen.getByRole("radio", { name: "Successful delivery" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Poison item" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "Authentication rejection" })).not.toBeChecked();
});

test("reports the newly selected scenario", () => {
  const onSelectScenario = vi.fn();
  renderSelector("erp-b-success", onSelectScenario);

  fireEvent.click(screen.getByRole("radio", { name: "Poison item" }));

  expect(onSelectScenario).toHaveBeenCalledWith("erp-b-poison-item");
});

test("renders translated scenario names", () => {
  renderSelector("erp-b-authentication-rejection", undefined, "it");

  expect(screen.getByRole("group", { name: "Scenario registrato" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Autenticazione rifiutata" })).toBeChecked();
});

test("has no automatically detectable accessibility violations", async () => {
  const { container } = renderSelector();

  await expectNoAccessibilityViolations(container);
});

function renderSelector(
  selectedScenarioId: FlowTraceScenarioId = "erp-b-success",
  onSelectScenario = vi.fn(),
  locale: SupportedLocale = "en",
) {
  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <FlowScenarioSelector
        selectedScenarioId={selectedScenarioId}
        onSelectScenario={onSelectScenario}
      />
    </I18nextProvider>,
  );
}
