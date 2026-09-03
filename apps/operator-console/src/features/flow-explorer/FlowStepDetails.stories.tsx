import type { Meta, StoryObj } from "@storybook/react-vite";

import { FlowStepDetails } from "./FlowStepDetails";
import type { FlowParticipant, FlowStep } from "./flowTrace";

const participants: readonly FlowParticipant[] = [
  { id: "connector-gateway", kind: "SERVICE", label: "Connector Gateway" },
  { id: "erp-b", kind: "EXTERNAL_SYSTEM", label: "ERP_B" },
];

const blockedStep: FlowStep = {
  id: "authentication-rejected",
  sequence: 2,
  offsetMs: 127,
  phase: "POLLING",
  kind: "INTERACTION",
  eventType: "ERP_AUTHENTICATION_REJECTED",
  sourceParticipantId: "erp-b",
  targetParticipantId: "connector-gateway",
  status: "BLOCKED",
  evidence: [
    { name: "HTTP_STATUS", value: "401" },
    { name: "ERROR_CODE", value: "ERP_B_AUTHENTICATION_REJECTED" },
  ],
};

const meta = {
  title: "Flow Explorer/FlowStepDetails",
  component: FlowStepDetails,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    participants,
    step: blockedStep,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FlowStepDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConfigurationBlocked: Story = {};

export const WithoutEvidence: Story = {
  args: {
    step: { ...blockedStep, evidence: [] },
  },
};
