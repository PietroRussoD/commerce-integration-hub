import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { expect, userEvent, within } from "storybook/test";

import { AccessTokenProvider } from "../../auth/AccessTokenProvider";

import { ProjectedOrderSearch } from "./ProjectedOrderSearch";

const meta = {
  title: "Orders/ProjectedOrderSearch",
  component: ProjectedOrderSearch,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    isAvailable: true,
    isAvailabilityKnown: true,
    isFetching: false,
    onRepeatSearch: () => {},
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <AccessTokenProvider>
          <div className="max-w-4xl">
            <Story />
          </div>
          </AccessTokenProvider>
        </QueryClientProvider>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof ProjectedOrderSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {};

export const AdvancedFilters: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Toggle search filters" }));

    await expect(canvas.getByRole("textbox", { name: "External order ID" })).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "SKU" })).toBeInTheDocument();
  },
};

export const Unavailable: Story = {
  args: {
    isAvailable: false,
  },
};
