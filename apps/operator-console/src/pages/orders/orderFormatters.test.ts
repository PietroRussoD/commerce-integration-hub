import { expect, test } from "vitest";

import { formatDateTime, formatDuration, formatLabel, formatMoney, orderStatusLabelKeys } from "./orderFormatters";

test("maps known order states to shared translation keys", () => {
  expect(orderStatusLabelKeys.READY).toBe("orders.status.ready");
});

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
  expect(formatDuration("2026-08-21T08:00:00Z", null, "it-IT", "In corso")).toBe("In corso");
  expect(formatDuration("2026-08-21T08:00:00Z", "2026-08-21T08:00:00.750Z")).toBe("750 ms");
  expect(formatDuration("2026-08-21T08:00:00Z", "2026-08-21T08:00:01.250Z")).toBe("1.3 s");
  expect(formatDuration("2026-08-21T08:00:00Z", "2026-08-21T08:00:01.250Z", "it-IT")).toBe("1,3 s");
});
