import type { Meta, StoryObj } from "@storybook/react-vite";

import { FlowPlaybackControls } from "./FlowPlaybackControls";

const meta = {
  title: "Flow Explorer/FlowPlaybackControls",
  component: FlowPlaybackControls,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    activeStepIndex: 3,
    onPause: () => undefined,
    onPlay: () => undefined,
    onRestart: () => undefined,
    onSelectStep: () => undefined,
    progress: 0.38,
    status: "PLAYING",
    stepCount: 10,
  },
} satisfies Meta<typeof FlowPlaybackControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {};

export const Paused: Story = {
  args: {
    status: "PAUSED",
  },
};

export const Completed: Story = {
  args: {
    activeStepIndex: 9,
    progress: 1,
    status: "COMPLETED",
  },
};
