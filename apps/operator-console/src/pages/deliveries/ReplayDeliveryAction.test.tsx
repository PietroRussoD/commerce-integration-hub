import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { replayOperatorDelivery } from "../../api/connectorGatewayClient";
import { AppProviders } from "../../app/AppProviders";
import { ReplayDeliveryAction } from "./ReplayDeliveryAction";

vi.mock("../../api/connectorGatewayClient", () => ({
  ConnectorGatewayApiError: class ConnectorGatewayApiError extends Error {},
  replayOperatorDelivery: vi.fn(),
}));

const mockedReplayOperatorDelivery = vi.mocked(replayOperatorDelivery);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("requires a reason before replaying a delivery", () => {
  renderAction();

  fireEvent.click(screen.getByRole("button", { name: "Replay delivery" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm replay" }));

  expect(screen.getByRole("alert")).toHaveTextContent("A replay reason is required");
  expect(screen.getByLabelText("Reason")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Reason")).toHaveAttribute("aria-describedby", "delivery-replay-reason-error");
  expect(screen.getByLabelText("Reason")).toHaveFocus();
  expect(mockedReplayOperatorDelivery).not.toHaveBeenCalled();
});

test("focuses the reason and restores the trigger after closing", async () => {
  renderAction();
  const trigger = screen.getByRole("button", { name: "Replay delivery" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByLabelText("Reason")).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Close replay delivery dialog" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("does not render a recovery control without platform-admin permission", () => {
  render(
    <AppProviders>
      <ReplayDeliveryAction
        accessToken="operator-token"
        canReplay={false}
        deliveryId="c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21"
        onReplayAccepted={vi.fn()}
      />
    </AppProviders>,
  );

  expect(screen.queryByRole("button", { name: "Replay delivery" })).not.toBeInTheDocument();
});

test("associates a request error with the reason without marking the reason invalid", async () => {
  mockedReplayOperatorDelivery.mockRejectedValueOnce(new Error("Synthetic replay request failed"));
  renderAction();
  fireEvent.click(screen.getByRole("button", { name: "Replay delivery" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic recovery check" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm replay" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic replay request failed");
  expect(screen.getByLabelText("Reason")).toHaveAttribute("aria-describedby", "delivery-replay-request-error");
  expect(screen.getByLabelText("Reason")).not.toHaveAttribute("aria-invalid", "true");
});

test("submits an idempotent replay command and reports an accepted replay", async () => {
  const onReplayAccepted = vi.fn();
  const randomUUID = vi.fn(() => "426a23e6-5234-4d38-9907-e2979ab2d9f5");
  vi.stubGlobal("crypto", { randomUUID });
  mockedReplayOperatorDelivery.mockResolvedValue({
    commandId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21",
    idempotent: false,
    outcome: "REPLAYED",
  });

  renderAction({ onReplayAccepted });
  randomUUID.mockClear();

  fireEvent.click(screen.getByRole("button", { name: "Replay delivery" }));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "The Core endpoint is available again" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm replay" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Replay command c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21 was accepted.");
  expect(randomUUID).toHaveBeenCalledOnce();
  expect(mockedReplayOperatorDelivery).toHaveBeenCalledWith({
    accessToken: "admin-token",
    deliveryId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21",
    idempotencyKey: "426a23e6-5234-4d38-9907-e2979ab2d9f5",
    reason: "The Core endpoint is available again",
  });
  expect(onReplayAccepted).toHaveBeenCalledOnce();
});

function renderAction({ onReplayAccepted = vi.fn() }: { onReplayAccepted?: () => void } = {}) {
  return render(
    <AppProviders>
      <ReplayDeliveryAction
        accessToken="admin-token"
        canReplay
        deliveryId="c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21"
        onReplayAccepted={onReplayAccepted}
      />
    </AppProviders>,
  );
}
