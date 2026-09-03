import type { Meta, StoryObj } from "@storybook/react-vite";

import { FlowStage } from "./FlowStage";
import type { FlowParticipant, FlowStep } from "./flowTrace";

const successParticipants: readonly FlowParticipant[] = [
  { id: "erp-b", kind: "EXTERNAL_SYSTEM", label: "ERP_B" },
  { id: "connector-gateway", kind: "SERVICE", label: "Connector Gateway" },
  { id: "gateway-database", kind: "DATABASE", label: "Gateway PostgreSQL" },
  { id: "integration-core", kind: "SERVICE", label: "Integration Core" },
  { id: "core-database", kind: "DATABASE", label: "Core PostgreSQL" },
  { id: "kafka", kind: "MESSAGE_BROKER", label: "Kafka / Redpanda" },
];

const publishedStep: FlowStep = {
  id: "publish-order-event",
  sequence: 7,
  offsetMs: 4_255,
  phase: "PROCESSING",
  kind: "MESSAGE",
  eventType: "ORDER_EVENT_PUBLISHED",
  sourceParticipantId: "integration-core",
  targetParticipantId: "kafka",
  status: "SUCCEEDED",
  evidence: [{ name: "EVENT_TYPE", value: "OrderReceived" }],
};

const meta = {
  title: "Flow Explorer/FlowStage",
  component: FlowStage,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    participants: successParticipants,
    activeStep: publishedStep,
  },
} satisfies Meta<typeof FlowStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MessagePublished: Story = {};

export const ConfigurationBlocked: Story = {
  args: {
    participants: successParticipants.slice(0, 3),
    activeStep: {
      ...publishedStep,
      id: "block-connector",
      sequence: 3,
      offsetMs: 6,
      phase: "POLLING",
      kind: "STATE_TRANSITION",
      eventType: "CONNECTOR_CONFIGURATION_BLOCKED",
      sourceParticipantId: "connector-gateway",
      targetParticipantId: "gateway-database",
      status: "BLOCKED",
      evidence: [{ name: "CONNECTOR_STATE", value: "BLOCKED_CONFIGURATION" }],
    },
  },
};

export const TerminalOutcome: Story = {
  args: {
    participants: successParticipants,
    activeStep: {
      ...publishedStep,
      id: "scenario-completed",
      sequence: 10,
      offsetMs: 4_779,
      phase: "COMPLETION",
      kind: "OUTCOME",
      eventType: "SCENARIO_COMPLETED",
      targetParticipantId: undefined,
      status: "SUCCEEDED",
      evidence: [{ name: "ORDER_STATUS", value: "READY" }],
    },
  },
};
