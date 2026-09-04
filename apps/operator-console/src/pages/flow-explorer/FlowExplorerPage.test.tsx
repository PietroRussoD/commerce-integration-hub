import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import authenticationArtifact from "../../../public/flow-traces/v1/erp-b-authentication-rejection.json";
import poisonArtifact from "../../../public/flow-traces/v1/erp-b-poison-item.json";
import successArtifact from "../../../public/flow-traces/v1/erp-b-success.json";
import { parseFlowTrace } from "../../features/flow-explorer/flowTrace";
import { loadFlowTrace } from "../../features/flow-explorer/loadFlowTrace";
import { createAppI18n, type SupportedLocale } from "../../i18n/i18n";
import { expectNoAccessibilityViolations } from "../../test/accessibility";
import { FlowExplorerPage } from "./FlowExplorerPage";

vi.mock("../../features/flow-explorer/loadFlowTrace", () => ({ loadFlowTrace: vi.fn() }));

const loadFlowTraceMock = vi.mocked(loadFlowTrace);
const tracesByUrl = new Map([
  ["/flow-traces/v1/erp-b-success.json", parseFlowTrace(successArtifact)],
  ["/flow-traces/v1/erp-b-poison-item.json", parseFlowTrace(poisonArtifact)],
  ["/flow-traces/v1/erp-b-authentication-rejection.json", parseFlowTrace(authenticationArtifact)],
]);

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  loadFlowTraceMock.mockImplementation(async ({ url }) => {
    const trace = tracesByUrl.get(url);
    if (trace === undefined) throw new Error(`Unexpected trace URL: ${url}`);
    return trace;
  });
});

afterEach(() => {
  cleanup();
  loadFlowTraceMock.mockReset();
  vi.unstubAllGlobals();
});

test("assembles a loaded trace into the explorer", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { name: "Flow Explorer" })).toBeInTheDocument();
  expect(await screen.findByRole("region", { name: "Integration flow participants" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Event sequence" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Flow playback controls" })).toBeInTheDocument();
  expect(screen.getAllByText("ERP_PAGE_REQUESTED").length).toBeGreaterThan(0);
});

test("loads and explores a different recorded scenario", async () => {
  renderPage();
  await screen.findByRole("region", { name: "Integration flow participants" });

  fireEvent.click(screen.getByRole("radio", { name: "Poison item" }));
  const rejectedStep = await screen.findByRole("button", {
    name: /Step 3, ERP_ITEM_REJECTED, Rejected/,
  });
  fireEvent.click(rejectedStep);

  expect(await screen.findByRole("heading", { name: "ERP_ITEM_REJECTED" })).toBeInTheDocument();
  expect(loadFlowTraceMock).toHaveBeenCalledWith(
    expect.objectContaining({ url: "/flow-traces/v1/erp-b-poison-item.json" }),
  );
});

test("renders a loading state", () => {
  loadFlowTraceMock.mockReturnValue(new Promise(() => undefined));

  renderPage();

  expect(screen.getByRole("status")).toHaveTextContent("Loading recorded flow");
});

test("renders an actionable error state", async () => {
  loadFlowTraceMock.mockRejectedValue(new Error("trace unavailable"));
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the recorded flow");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  await waitFor(() => expect(loadFlowTraceMock).toHaveBeenCalledTimes(2));
});

test("renders translated page content", async () => {
  renderPage("it");

  expect(await screen.findByRole("heading", { name: "Esplorazione flussi" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Scenario registrato" })).toBeInTheDocument();
});

test("has no automatically detectable accessibility violations", async () => {
  const { container } = renderPage();
  await screen.findByRole("region", { name: "Integration flow participants" });

  await expectNoAccessibilityViolations(container);
});

function renderPage(locale: SupportedLocale = "en") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={createAppI18n(locale)} defaultNS="common">
      <QueryClientProvider client={queryClient}>
        <FlowExplorerPage />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}
