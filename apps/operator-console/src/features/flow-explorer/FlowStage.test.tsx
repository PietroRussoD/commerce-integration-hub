import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test } from "vitest";

import successArtifact from "../../../public/flow-traces/v1/erp-b-success.json";
import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { FlowStage } from "./FlowStage";
import { parseFlowTrace, type FlowStep } from "./flowTrace";

const trace = parseFlowTrace(successArtifact);
const publishStep = trace.steps.find(({ eventType }) => eventType === "ORDER_EVENT_PUBLISHED");

afterEach(cleanup);

test("shows every participant and identifies the active connection", () => {
  renderStage();

  expect(screen.getAllByRole("listitem")).toHaveLength(6);
  expect(screen.getByRole("listitem", { name: "Integration Core, Source" })).toHaveAttribute(
    "data-flow-role",
    "source",
  );
  expect(screen.getByRole("listitem", { name: "Kafka / Redpanda, Destination" })).toHaveAttribute(
    "data-flow-role",
    "target",
  );
  expect(screen.getByText("ORDER_EVENT_PUBLISHED")).toBeInTheDocument();
});

test("renders translated participant roles", () => {
  renderStage("it");

  expect(screen.getByRole("region", { name: "Partecipanti al flusso di integrazione" })).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Integration Core, Origine" })).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Kafka / Redpanda, Destinazione" })).toBeInTheDocument();
});

test("renders a terminal event without inventing a target participant", () => {
  const terminalStep = trace.steps.at(-1);
  if (terminalStep === undefined) {
    throw new Error("The success trace must contain a terminal step");
  }

  renderStage("en", terminalStep);

  expect(screen.getByText("Outcome")).toBeInTheDocument();
  expect(screen.getByText("Result")).toBeInTheDocument();
  expect(screen.queryByRole("listitem", { name: /Destination/ })).not.toBeInTheDocument();
});

test("has no automatically detectable accessibility violations", async () => {
  const { container } = renderStage();

  await expectNoAccessibilityViolations(container);
});

function renderStage(locale: SupportedLocale = "en", activeStep: FlowStep | undefined = publishStep) {
  if (activeStep === undefined) {
    throw new Error("The success trace must contain the requested step");
  }

  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <FlowStage participants={trace.participants} activeStep={activeStep} />
    </I18nextProvider>,
  );
}
