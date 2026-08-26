import { expect, test } from "vitest";

import { formatDuration, formatLabel, formatTransition } from "./orderFormatters";

test("formats enum-like values as readable labels", () => {
  expect(formatLabel("FAILED_RETRYABLE")).toBe("Failed Retryable");
});

test("formats completed and active attempt durations", () => {
  expect(formatDuration("2026-08-21T08:00:00Z", null)).toBe("In progress");
  expect(formatDuration("2026-08-21T08:00:00Z", "2026-08-21T08:00:00.750Z")).toBe("750 ms");
  expect(formatDuration("2026-08-21T08:00:00Z", "2026-08-21T08:00:01.250Z")).toBe("1.3 s");
});

test("formats every status-transition shape", () => {
  expect(formatTransition("RECEIVED", "PROCESSING")).toBe("Received to Processing");
  expect(formatTransition(null, "RECEIVED")).toBe("Entered Received");
  expect(formatTransition("PROCESSING", null)).toBe("Left Processing");
  expect(formatTransition(null, null)).toBeUndefined();
});
