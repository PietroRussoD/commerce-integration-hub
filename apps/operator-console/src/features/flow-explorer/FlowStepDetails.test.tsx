import { cleanup, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test } from "vitest";

import successArtifact from "../../../public/flow-traces/v1/erp-b-success.json";
import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { FlowStepDetails } from "./FlowStepDetails";
import { parseFlowTrace, type FlowStep } from "./flowTrace";

const trace = parseFlowTrace(successArtifact);
const requestStep = trace.steps[0];

afterEach(cleanup);

test("shows the selected step metadata and evidence", () => {
  renderDetails();

  expect(screen.getByRole("heading", { name: "ERP_PAGE_REQUESTED" })).toBeInTheDocument();
  expect(screen.getByText("Connector Gateway")).toBeInTheDocument();
  expect(screen.getByText("ERP_B")).toBeInTheDocument();
  const evidence = screen.getByText("HTTP_METHOD").parentElement;
  expect(evidence).not.toBeNull();
  expect(within(evidence as HTMLElement).getByText("GET")).toBeInTheDocument();
});

test("describes a terminal step as an outcome", () => {
  const terminalStep = trace.steps.at(-1);
  if (terminalStep === undefined) {
    throw new Error("The success trace must contain a terminal step");
  }

  renderDetails("en", terminalStep);

  expect(screen.getAllByText("Outcome")).toHaveLength(2);
  expect(screen.getByText("Succeeded")).toBeInTheDocument();
});

test("handles a step without evidence", () => {
  renderDetails("en", { ...requestStep, evidence: [] });

  expect(screen.getByText("No evidence was recorded for this step.")).toBeInTheDocument();
});

test("renders translated labels", () => {
  renderDetails("it");

  expect(screen.getByText("Passaggio 1")).toBeInTheDocument();
  expect(screen.getByText("Interazione")).toBeInTheDocument();
  expect(screen.getByText("Destinazione")).toBeInTheDocument();
});

test("has no automatically detectable accessibility violations", async () => {
  const { container } = renderDetails();

  await expectNoAccessibilityViolations(container);
});

function renderDetails(locale: SupportedLocale = "en", step: FlowStep = requestStep) {
  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <FlowStepDetails participants={trace.participants} step={step} />
    </I18nextProvider>,
  );
}
