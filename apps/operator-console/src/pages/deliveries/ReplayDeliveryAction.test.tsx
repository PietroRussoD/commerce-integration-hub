import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { ConnectorGatewayApiError, replayOperatorDelivery } from "../../api/connectorGatewayClient";
import { AppProviders } from "../../app/AppProviders";
import type { ReplayDeliveryTarget } from "./deliveryReplayEligibility";
import { ReplayDeliveryAction } from "./ReplayDeliveryAction";

vi.mock(import("../../api/connectorGatewayClient"), async (importOriginal) => ({ ...await importOriginal(), replayOperatorDelivery: vi.fn() }));

const replayTarget: ReplayDeliveryTarget = {
  deliveryId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21", status: "EXHAUSTED", connectorStatus: "ACTIVE",
  payloadRetained: true, payloadExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

const mockedReplayOperatorDelivery = vi.mocked(replayOperatorDelivery);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("requires a reason before replaying a delivery", () => {
  renderAction();

  fireEvent.click(screen.getByRole("button", { name: "Request a new send attempt" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm request" }));

  expect(screen.getByRole("alert")).toHaveTextContent("A replay reason is required");
  expect(screen.getByLabelText("Reason")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Reason")).toHaveAttribute("aria-describedby", "delivery-replay-reason-error");
  expect(screen.getByLabelText("Reason")).toHaveFocus();
  expect(mockedReplayOperatorDelivery).not.toHaveBeenCalled();
});

test("focuses the reason and restores the trigger after closing", async () => {
  renderAction();
  const trigger = screen.getByRole("button", { name: "Request a new send attempt" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByLabelText("Reason")).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Close send attempt dialog" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("explains the platform-admin requirement and disables a new send request", () => {
  render(
    <AppProviders>
      <ReplayDeliveryAction
        accessToken="operator-token"
        hasReplayPermission={false}
        delivery={replayTarget}
      />
    </AppProviders>,
  );

  expect(screen.getByRole("button", { name: "Request a new send attempt" })).toBeDisabled();
  expect(screen.getByText(/requires the platform-admin role/)).toBeInTheDocument();
});

test("associates a request error with the reason without marking the reason invalid", async () => {
  mockedReplayOperatorDelivery.mockRejectedValueOnce(new Error("Synthetic replay request failed"));
  renderAction();
  fireEvent.click(screen.getByRole("button", { name: "Request a new send attempt" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic recovery check" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm request" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic replay request failed");
  expect(screen.getByLabelText("Reason")).toHaveAttribute("aria-describedby", "delivery-replay-request-error");
  expect(screen.getByLabelText("Reason")).not.toHaveAttribute("aria-invalid", "true");
});

test("submits an idempotent replay command and reports an accepted replay", async () => {
  const randomUUID = vi.fn(() => "426a23e6-5234-4d38-9907-e2979ab2d9f5");
  vi.stubGlobal("crypto", { randomUUID });
  mockedReplayOperatorDelivery.mockResolvedValue({
    commandId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21",
    idempotent: false,
    outcome: "REPLAYED",
  });

  renderAction();
  randomUUID.mockClear();

  fireEvent.click(screen.getByRole("button", { name: "Request a new send attempt" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "The Core endpoint is available again" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm request" }));

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Replay command c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21 was accepted."));
  expect(randomUUID).toHaveBeenCalledOnce();
  expect(mockedReplayOperatorDelivery).toHaveBeenCalledWith({
    accessToken: "admin-token",
    deliveryId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21",
    idempotencyKey: "426a23e6-5234-4d38-9907-e2979ab2d9f5",
    reason: "The Core endpoint is available again",
  });
});

test("closing and reopening a pending replay preserves the request and blocks another submission", async () => {
  let resolve!: (response: Awaited<ReturnType<typeof replayOperatorDelivery>>) => void;
  mockedReplayOperatorDelivery.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  renderAction();
  fireEvent.click(screen.getByRole("button", { name: "Request a new send attempt" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic recovery check" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm request" }));
  await waitFor(() => expect(mockedReplayOperatorDelivery).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Close send attempt dialog" }));
  fireEvent.click(screen.getByRole("button", { name: "View pending request" }));

  expect(screen.getByLabelText("Reason")).toHaveValue("Synthetic recovery check");
  expect(screen.getByLabelText("Reason")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Confirm request" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close send attempt dialog" })).toHaveFocus();
  fireEvent.submit(screen.getByLabelText("Reason").closest("form")!);
  expect(mockedReplayOperatorDelivery).toHaveBeenCalledOnce();

  await act(async () => resolve({ commandId: "synthetic-command", idempotent: false, outcome: "IN_PROGRESS" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Replay command synthetic-command is already in progress."));
});

test("reopens an uncertain command with an immutable reason and retries the same intention", async () => {
  mockedReplayOperatorDelivery.mockRejectedValueOnce(new TypeError("Lost response")).mockResolvedValueOnce({
    commandId: "synthetic-command", idempotent: true, outcome: "REPLAYED",
  });
  renderAction();
  fireEvent.click(screen.getByRole("button", { name: "Request a new send attempt" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic recovery check" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm request" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Outcome unconfirmed");
  fireEvent.click(screen.getByRole("button", { name: "Close send attempt dialog" }));
  fireEvent.click(screen.getByRole("button", { name: "Resolve replay request" }));
  expect(screen.getByLabelText("Reason")).toHaveValue("Synthetic recovery check");
  expect(screen.getByLabelText("Reason")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Reason")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Retry the same request" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("was accepted"));
  expect(mockedReplayOperatorDelivery.mock.calls[1][0]).toEqual(mockedReplayOperatorDelivery.mock.calls[0][0]);
});

test("a definitive rejection keeps the reason editable for a new confirmed intention", async () => {
  mockedReplayOperatorDelivery.mockRejectedValueOnce(new ConnectorGatewayApiError(409, {
    type: "urn:problem:connector-not-active", title: "Delivery replay rejected", status: 409, detail: "Synthetic rejection",
  }));
  renderAction();
  fireEvent.click(screen.getByRole("button", { name: "Request a new send attempt" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic recovery check" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm request" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The Gateway rejected this request");
  expect(screen.getByLabelText("Reason")).not.toHaveAttribute("readonly");
  expect(screen.getByRole("button", { name: "Confirm request" })).toBeEnabled();
});

test("confirmation rechecks expiry even when the retention timer has not fired", () => {
  vi.useFakeTimers();
  const expiresAt = Date.parse(replayTarget.payloadExpiresAt);
  vi.setSystemTime(expiresAt - 1_000);
  renderAction();
  fireEvent.click(screen.getByRole("button", { name: "Request a new send attempt" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic recovery" } });
  vi.setSystemTime(expiresAt);
  fireEvent.submit(screen.getByLabelText("Reason").closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("retention period has expired");
  expect(screen.getByLabelText("Reason")).not.toHaveAttribute("aria-invalid", "true");
  expect(mockedReplayOperatorDelivery).not.toHaveBeenCalled();
});

function renderAction() {
  return render(
    <AppProviders>
      <ReplayDeliveryAction
        accessToken="admin-token"
        hasReplayPermission
        delivery={replayTarget}
      />
    </AppProviders>,
  );
}
