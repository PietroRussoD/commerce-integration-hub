import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useDeliveryPayloadState } from "./useDeliveryPayloadState";

afterEach(() => { cleanup(); vi.useRealTimers(); });

test("expires at the retention boundary while the detail remains mounted", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  const { result } = renderHook(() => useDeliveryPayloadState({ payloadRetained: true, payloadExpiresAt: "2026-10-16T12:00:01Z" }));
  expect(result.current).toBe("available");
  act(() => vi.advanceTimersByTime(1_000));
  expect(result.current).toBe("expired");
});

test("rechecks the wall clock when returning after delayed background timers", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  const { result } = renderHook(() => useDeliveryPayloadState({ payloadRetained: true, payloadExpiresAt: "2026-10-16T12:00:01Z" }));
  vi.setSystemTime(new Date("2026-10-16T12:00:02Z"));
  fireEvent.focus(window);
  expect(result.current).toBe("expired");
});

test("long retention windows do not overflow the timer into immediate expiry", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  const expiresAt = new Date(Date.now() + 2_147_483_747).toISOString();
  const { result } = renderHook(() => useDeliveryPayloadState({ payloadRetained: true, payloadExpiresAt: expiresAt }));
  act(() => vi.advanceTimersByTime(2_147_483_647));
  expect(result.current).toBe("available");
  act(() => vi.advanceTimersByTime(100));
  expect(result.current).toBe("expired");
});
