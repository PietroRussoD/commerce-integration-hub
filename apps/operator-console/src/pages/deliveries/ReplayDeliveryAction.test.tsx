import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  expect(mockedReplayOperatorDelivery).not.toHaveBeenCalled();
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
