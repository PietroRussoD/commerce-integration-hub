import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { FlowTrace } from "./flowTrace";
import { useFlowPlayback } from "./useFlowPlayback";

const trace = {
  traceId: "first-trace",
  durationMs: 1_000,
  steps: [{ id: "first", offsetMs: 0 }, { id: "second", offsetMs: 1_000 }],
} as FlowTrace;

let scheduledFrame: FrameRequestCallback | undefined;

beforeEach(() => {
  scheduledFrame = undefined;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("advances with animation frames and exposes the active step", () => {
  const { result } = renderHook(() => useFlowPlayback(trace, { reducedMotion: false }));

  runFrame(1_000);
  runFrame(2_000);

  expect(result.current.state).toEqual({ activeStepIndex: 1, elapsedMs: 1_000, status: "COMPLETED" });
  expect(result.current.activeStep.id).toBe("second");
  expect(result.current.progress).toBe(1);
});

test("supports pause, resume, manual selection and restart", () => {
  const { result } = renderHook(() => useFlowPlayback(trace, { reducedMotion: false }));

  act(() => result.current.pause());
  expect(result.current.state.status).toBe("PAUSED");
  expect(cancelAnimationFrame).toHaveBeenCalled();

  act(() => result.current.selectStep(1));
  expect(result.current.state).toEqual({ activeStepIndex: 1, elapsedMs: 1_000, status: "COMPLETED" });

  act(() => result.current.play());
  expect(result.current.state).toEqual({ activeStepIndex: 0, elapsedMs: 0, status: "PLAYING" });

  act(() => result.current.restart());
  expect(result.current.state).toEqual({ activeStepIndex: 0, elapsedMs: 0, status: "PLAYING" });
});

test("starts paused when reduced motion is requested", () => {
  const { result } = renderHook(() => useFlowPlayback(trace, { reducedMotion: true }));

  expect(result.current.state.status).toBe("PAUSED");
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});

test("resets playback when the trace changes", () => {
  const secondTrace = { ...trace, traceId: "second-trace" };
  const { rerender, result } = renderHook(
    ({ selectedTrace }: { selectedTrace: FlowTrace }) =>
      useFlowPlayback(selectedTrace, { autoPlay: false, reducedMotion: false }),
    { initialProps: { selectedTrace: trace } },
  );
  act(() => result.current.selectStep(1));

  rerender({ selectedTrace: secondTrace });

  expect(result.current.activeStep.id).toBe("first");
  expect(result.current.state).toEqual({ activeStepIndex: 0, elapsedMs: 0, status: "PAUSED" });
});

function runFrame(timestamp: number): void {
  const frame = scheduledFrame;
  if (frame === undefined) {
    throw new Error("No animation frame is scheduled");
  }
  act(() => frame(timestamp));
}
