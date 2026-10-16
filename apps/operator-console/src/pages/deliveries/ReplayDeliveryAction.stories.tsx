import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { AccessTokenProvider } from "../../auth/AccessTokenProvider";
import { ReplayDeliveryAction } from "./ReplayDeliveryAction";
import { ReplayRequestsProvider } from "./ReplayRequestsProvider";

const meta = {
  title: "Deliveries/ReplayDeliveryAction",
  component: ReplayDeliveryAction,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    accessToken: "synthetic-story-token",
    hasReplayPermission: true,
    delivery: { deliveryId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21", status: "EXHAUSTED", connectorStatus: "ACTIVE", payloadRetained: true, payloadExpiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <AccessTokenProvider><ReplayRequestsProvider><Story /></ReplayRequestsProvider></AccessTokenProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ReplayDeliveryAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {};

export const DialogOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Request a new send attempt" }));
    await expect(within(document.body).getByRole("dialog")).toBeInTheDocument();
  },
};

export const ReasonRequired: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Request a new send attempt" }));

    const dialog = within(document.body).getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm request" }));

    await expect(within(dialog).getByRole("alert")).toHaveTextContent("A replay reason is required");
  },
};
