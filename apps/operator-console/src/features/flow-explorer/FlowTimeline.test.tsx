import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";

import successArtifact from "../../../public/flow-traces/v1/erp-b-success.json";
import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { FlowTimeline } from "./FlowTimeline";
import { parseFlowTrace } from "./flowTrace";

const trace = parseFlowTrace(successArtifact);

afterEach(cleanup);

test("renders trace events and marks the active step", () => {
  renderTimeline();

  expect(screen.getByText("Step 3 of 10")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Step 3, ERP_PAGE_COMMITTED, Succeeded/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(screen.getByText("+2.03 s")).toBeInTheDocument();
});

test("selects a step through pointer input", () => {
  const onSelectStep = vi.fn();
  renderTimeline("en", 2, onSelectStep);

  fireEvent.click(screen.getByRole("button", { name: /Step 5, CANONICAL_ORDER_PERSISTED/ }));

  expect(onSelectStep).toHaveBeenCalledWith(4);
});

test("supports directional and boundary keyboard navigation", () => {
  const onSelectStep = vi.fn();
  renderTimeline("en", 2, onSelectStep);
  const activeButton = screen.getByRole("button", { name: /Step 3, ERP_PAGE_COMMITTED/ });

  activeButton.focus();
  fireEvent.keyDown(activeButton, { key: "ArrowDown" });
  expect(onSelectStep).toHaveBeenLastCalledWith(3);
  expect(screen.getByRole("button", { name: /Step 4, CANONICAL_ORDER_FORWARDED/ })).toHaveFocus();

  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
  expect(onSelectStep).toHaveBeenLastCalledWith(9);
  expect(screen.getByRole("button", { name: /Step 10, SCENARIO_COMPLETED/ })).toHaveFocus();
});

test("renders translated timeline labels", () => {
  renderTimeline("it");

  expect(screen.getByRole("region", { name: "Sequenza degli eventi" })).toBeInTheDocument();
  expect(screen.getByText("Passaggio 3 di 10")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Passaggio 3, ERP_PAGE_COMMITTED, Completato/ })).toBeInTheDocument();
});

test("has no automatically detectable accessibility violations", async () => {
  const { container } = renderTimeline();

  await expectNoAccessibilityViolations(container);
});

function renderTimeline(
  locale: SupportedLocale = "en",
  activeStepIndex = 2,
  onSelectStep = vi.fn(),
) {
  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <FlowTimeline steps={trace.steps} activeStepIndex={activeStepIndex} onSelectStep={onSelectStep} />
    </I18nextProvider>,
  );
}
