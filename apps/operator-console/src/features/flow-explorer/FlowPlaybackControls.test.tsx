import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";

import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { FlowPlaybackControls, type FlowPlaybackControlsProps } from "./FlowPlaybackControls";

afterEach(cleanup);

test("shows playback state and normalized progress", () => {
  renderControls({ activeStepIndex: 2, progress: 0.42, status: "PLAYING", stepCount: 10 });

  expect(screen.getByText("Step 3 of 10 · Playing")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Flow playback progress" })).toHaveAttribute(
    "aria-valuenow",
    "42",
  );
  expect(screen.getByRole("button", { name: "Pause playback" })).toBeInTheDocument();
});

test("invokes playback and step-selection actions", () => {
  const actions = createActions();
  renderControls({ activeStepIndex: 2, progress: 0.42, status: "PAUSED", stepCount: 10 }, actions);

  fireEvent.click(screen.getByRole("button", { name: "Restart playback" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
  fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
  fireEvent.click(screen.getByRole("button", { name: "Next step" }));

  expect(actions.onRestart).toHaveBeenCalledOnce();
  expect(actions.onSelectStep).toHaveBeenNthCalledWith(1, 1);
  expect(actions.onPlay).toHaveBeenCalledOnce();
  expect(actions.onSelectStep).toHaveBeenNthCalledWith(2, 3);
});

test("disables step navigation at timeline boundaries", () => {
  const { rerender } = renderControls({ activeStepIndex: 0, progress: 0, status: "PAUSED", stepCount: 3 });

  expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next step" })).toBeEnabled();

  rerender(controlsElement("en", { activeStepIndex: 2, progress: 1, status: "COMPLETED", stepCount: 3 }));
  expect(screen.getByRole("button", { name: "Previous step" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
});

test("renders translated controls", () => {
  renderControls({ activeStepIndex: 1, progress: 0.5, status: "PAUSED", stepCount: 4 }, undefined, "it");

  expect(screen.getByText("Passaggio 2 di 4 · In pausa")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Riproduci il flusso" })).toBeInTheDocument();
});

test("has no automatically detectable accessibility violations", async () => {
  const { container } = renderControls({ activeStepIndex: 2, progress: 1, status: "COMPLETED", stepCount: 3 });

  await expectNoAccessibilityViolations(container);
});

const defaultState: Pick<
  FlowPlaybackControlsProps,
  "activeStepIndex" | "progress" | "status" | "stepCount"
> = {
  activeStepIndex: 0,
  progress: 0,
  status: "PAUSED",
  stepCount: 3,
};

function createActions() {
  return {
    onPause: vi.fn(),
    onPlay: vi.fn(),
    onRestart: vi.fn(),
    onSelectStep: vi.fn(),
  };
}

function renderControls(
  state: Partial<typeof defaultState> = {},
  actions = createActions(),
  locale: SupportedLocale = "en",
) {
  return render(controlsElement(locale, state, actions));
}

function controlsElement(
  locale: SupportedLocale,
  state: Partial<typeof defaultState>,
  actions = createActions(),
) {
  return (
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <FlowPlaybackControls {...defaultState} {...state} {...actions} />
    </I18nextProvider>
  );
}
