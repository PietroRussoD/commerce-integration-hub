import { expect, test } from "vitest";

import { formatDateTime, formatDuration, formatLabel, formatMoney, formatTransition } from "./orderFormatters";

test("formats enum-like values as readable labels", () => {
  expect(formatLabel("FAILED_RETRYABLE")).toBe("Failed Retryable");
});

test("formats dates and money for the selected locale", () => {
  expect(formatDateTime("2026-08-21T12:00:00Z", "en-GB")).toContain("Aug");
  expect(formatDateTime("2026-08-21T12:00:00Z", "it-IT")).toContain("ago");
  expect(formatMoney("39.98", "EUR", "en-GB")).toContain("39.98");
  expect(formatMoney("39.98", "EUR", "it-IT")).toContain("39,98");
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
