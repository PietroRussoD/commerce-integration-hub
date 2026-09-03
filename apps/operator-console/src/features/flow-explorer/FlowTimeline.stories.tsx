import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { FlowTimeline, type FlowTimelineProps } from "./FlowTimeline";
import type { FlowStep } from "./flowTrace";

const steps: readonly FlowStep[] = [
  {
    id: "request-page",
    sequence: 1,
    offsetMs: 0,
    phase: "POLLING",
    kind: "INTERACTION",
    eventType: "ERP_PAGE_REQUESTED",
    sourceParticipantId: "connector-gateway",
    targetParticipantId: "erp-b",
    status: "INFORMATIONAL",
    evidence: [],
  },
  {
    id: "persist-order",
    sequence: 2,
    offsetMs: 817,
    phase: "RECEIPT",
    kind: "PERSISTENCE",
    eventType: "CANONICAL_ORDER_PERSISTED",
    sourceParticipantId: "integration-core",
    targetParticipantId: "core-database",
    status: "SUCCEEDED",
    evidence: [],
  },
  {
    id: "reject-order",
    sequence: 3,
    offsetMs: 2_105,
    phase: "PROCESSING",
    kind: "STATE_TRANSITION",
    eventType: "ORDER_REJECTED",
    sourceParticipantId: "integration-core",
    targetParticipantId: "core-database",
    status: "REJECTED",
    evidence: [],
  },
  {
    id: "complete-scenario",
    sequence: 4,
    offsetMs: 2_105,
    phase: "COMPLETION",
    kind: "OUTCOME",
    eventType: "SCENARIO_COMPLETED_WITH_REJECTIONS",
    sourceParticipantId: "integration-core",
    status: "REJECTED",
    evidence: [],
  },
];

const meta = {
  title: "Flow Explorer/FlowTimeline",
  component: FlowTimeline,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    activeStepIndex: 0,
    onSelectStep: () => undefined,
    steps,
  },
  render: (args) => <InteractiveTimeline {...args} />,
} satisfies Meta<typeof FlowTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};

function InteractiveTimeline(args: FlowTimelineProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(args.activeStepIndex);

  return (
    <div className="max-w-md">
      <FlowTimeline {...args} activeStepIndex={activeStepIndex} onSelectStep={setActiveStepIndex} />
    </div>
  );
}
