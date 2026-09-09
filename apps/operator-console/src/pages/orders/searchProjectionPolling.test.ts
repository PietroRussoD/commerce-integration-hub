import { expect, test } from "vitest";

import { getSearchProjectionStatusRefetchInterval } from "./searchProjectionPolling";

const status = {
  consumerEnabled: true,
  readAlias: "orders-read",
  availability: "AVAILABLE",
  lastProjectedEventOccurredAt: null,
  lastProjectedAt: null,
  lastProjectionProcessingDelayMilliseconds: null,
  reconciliationInProgress: false,
  lastReconciliationCompletedAt: null,
  lastReconciliationScannedCount: null,
  lastReconciliationAppliedCount: null,
  lastReconciliationIgnoredCount: null,
  reindex: {
    phase: "IDLE",
    sourceIndex: null,
    candidateIndex: null,
    scannedCount: 0,
    appliedCount: 0,
    ignoredNonNewerVersionCount: 0,
  },
};

test("does not poll when no reindex is active", () => {
  expect(getSearchProjectionStatusRefetchInterval(undefined)).toBe(false);
  expect(getSearchProjectionStatusRefetchInterval(status)).toBe(false);
});

test("polls while a reindex phase is active", () => {
  expect(
    getSearchProjectionStatusRefetchInterval({
      ...status,
      reindex: { ...status.reindex, phase: "REBUILDING" },
    }),
  ).toBe(5_000);
});
