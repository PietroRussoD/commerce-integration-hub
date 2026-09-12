import type { Meta, StoryObj } from "@storybook/react-vite";

import type { OperatorOrderSearchProjectionStatus } from "../../api/integrationCoreClient";
import { SearchProjectionStatus } from "./SearchProjectionStatus";

const availableStatus: OperatorOrderSearchProjectionStatus = {
  consumerEnabled: true,
  readAlias: "orders-read",
  availability: "AVAILABLE",
  lastProjectedEventOccurredAt: "2026-09-08T08:00:01Z",
  lastProjectedAt: "2026-09-08T08:00:01.250Z",
  lastProjectionProcessingDelayMilliseconds: 250,
  reconciliationInProgress: false,
  lastReconciliationCompletedAt: "2026-09-08T08:00:00Z",
  lastReconciliationScannedCount: 20,
  lastReconciliationAppliedCount: 3,
  lastReconciliationIgnoredCount: 17,
  reindex: {
    phase: "IDLE",
    sourceIndex: null,
    candidateIndex: null,
    scannedCount: 0,
    appliedCount: 0,
    ignoredNonNewerVersionCount: 0,
  },
};

const meta = {
  title: "Orders/SearchProjectionStatus",
  component: SearchProjectionStatus,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    status: availableStatus,
    isPending: false,
    isError: false,
  },
} satisfies Meta<typeof SearchProjectionStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {};

export const Reindexing: Story = {
  args: {
    status: {
      ...availableStatus,
      reconciliationInProgress: true,
      reindex: {
        phase: "REBUILDING",
        sourceIndex: "orders-v1",
        candidateIndex: "orders-v2",
        scannedCount: 12_500,
        appliedCount: 12_250,
        ignoredNonNewerVersionCount: 250,
      },
    },
  },
};

export const Loading: Story = {
  args: {
    status: undefined,
    isPending: true,
  },
};

export const Unavailable: Story = {
  args: {
    status: undefined,
    isError: true,
  },
};
