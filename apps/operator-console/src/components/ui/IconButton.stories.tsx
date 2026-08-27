import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eye, RefreshCw } from "lucide-react";

import { IconButton } from "./IconButton";

const meta = {
  title: "UI/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  args: {
    children: <RefreshCw aria-hidden="true" size={17} />,
    label: "Refresh orders",
  },
  argTypes: {
    children: { control: false },
    className: { control: false },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bordered: Story = {};

export const Ghost: Story = {
  args: {
    children: <Eye aria-hidden="true" size={17} />,
    label: "Show source API key",
    size: "md",
    variant: "ghost",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
