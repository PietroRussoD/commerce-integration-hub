import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatusBadge } from "./StatusBadge";

const meta = {
  title: "UI/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  args: {
    children: "Ready",
    status: "READY",
  },
  argTypes: {
    children: { control: "text" },
    status: {
      control: "select",
      options: ["RECEIVED", "PROCESSING", "READY", "STARTED", "SUCCEEDED", "FAILED", "UNKNOWN"],
    },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Processing: Story = {
  args: {
    children: "Processing",
    status: "PROCESSING",
  },
};

export const Failed: Story = {
  args: {
    children: "Failed",
    status: "FAILED",
  },
};

export const Unknown: Story = {
  args: {
    children: "Unknown",
    status: "UNKNOWN",
  },
};
