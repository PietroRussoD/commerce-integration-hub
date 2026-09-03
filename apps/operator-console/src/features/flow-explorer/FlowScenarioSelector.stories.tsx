import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { FlowScenarioSelector, type FlowScenarioSelectorProps } from "./FlowScenarioSelector";
import type { FlowTraceScenarioId } from "./flowTrace";

const meta = {
  title: "Flow Explorer/FlowScenarioSelector",
  component: FlowScenarioSelector,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    onSelectScenario: () => undefined,
    selectedScenarioId: "erp-b-success",
  },
  render: (args) => <InteractiveSelector {...args} />,
} satisfies Meta<typeof FlowScenarioSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};

function InteractiveSelector(args: FlowScenarioSelectorProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<FlowTraceScenarioId>(
    args.selectedScenarioId,
  );

  return (
    <FlowScenarioSelector
      {...args}
      selectedScenarioId={selectedScenarioId}
      onSelectScenario={setSelectedScenarioId}
    />
  );
}
