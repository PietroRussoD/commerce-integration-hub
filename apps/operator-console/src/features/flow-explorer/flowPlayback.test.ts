import { describe, expect, test } from "vitest";

import type { FlowTrace } from "./flowTrace";
import {
  createFlowPlaybackTimeline,
  createInitialFlowPlaybackState,
  reduceFlowPlayback,
  type FlowPlaybackState,
} from "./flowPlayback";

const trace = {
  durationMs: 5_000,
  steps: [{ offsetMs: 0 }, { offsetMs: 20 }, { offsetMs: 1_020 }, { offsetMs: 5_000 }],
} as FlowTrace;

describe("flow playback timeline", () => {
  test("makes fast transitions readable and caps long idle gaps", () => {
    const timeline = createFlowPlaybackTimeline(trace);

    expect(timeline).toEqual({
      durationMs: 3_200,
      stepOffsetsMs: [0, 600, 1_600, 3_200],
    });
  });

  test("accepts a valid custom transition range", () => {
    expect(
      createFlowPlaybackTimeline(trace, { minimumTransitionMs: 100, maximumTransitionMs: 500 }),
    ).toEqual({ durationMs: 1_100, stepOffsetsMs: [0, 100, 600, 1_100] });
  });

  test.each([
    { minimumTransitionMs: 0 },
    { minimumTransitionMs: 700, maximumTransitionMs: 600 },
    { maximumTransitionMs: Number.POSITIVE_INFINITY },
  ])("rejects an invalid transition range: %o", (options) => {
    expect(() => createFlowPlaybackTimeline(trace, options)).toThrow(RangeError);
  });
});

describe("flow playback state", () => {
  const timeline = createFlowPlaybackTimeline(trace);

  test("advances through steps and completes at the timeline boundary", () => {
    let state = createInitialFlowPlaybackState(timeline);

    state = reduceFlowPlayback(state, { type: "ADVANCE", deltaMs: 599 }, timeline);
    expect(state).toEqual({ activeStepIndex: 0, elapsedMs: 599, status: "PLAYING" });

    state = reduceFlowPlayback(state, { type: "ADVANCE", deltaMs: 1 }, timeline);
    expect(state).toEqual({ activeStepIndex: 1, elapsedMs: 600, status: "PLAYING" });

    state = reduceFlowPlayback(state, { type: "ADVANCE", deltaMs: 10_000 }, timeline);
    expect(state).toEqual({ activeStepIndex: 3, elapsedMs: 3_200, status: "COMPLETED" });
  });

  test("pauses without advancing and resumes from the same point", () => {
    const playing = reduceFlowPlayback(
      createInitialFlowPlaybackState(timeline),
      { type: "ADVANCE", deltaMs: 700 },
      timeline,
    );
    const paused = reduceFlowPlayback(playing, { type: "PAUSE" }, timeline);

    expect(reduceFlowPlayback(paused, { type: "ADVANCE", deltaMs: 500 }, timeline)).toBe(paused);
    expect(reduceFlowPlayback(paused, { type: "PLAY" }, timeline)).toEqual({
      ...paused,
      status: "PLAYING",
    });
  });

  test("selects a step for inspection and restarts playback", () => {
    const selected = reduceFlowPlayback(
      createInitialFlowPlaybackState(timeline),
      { type: "SELECT_STEP", stepIndex: 2 },
      timeline,
    );

    expect(selected).toEqual({ activeStepIndex: 2, elapsedMs: 1_600, status: "PAUSED" });
    expect(reduceFlowPlayback(selected, { type: "RESTART" }, timeline)).toEqual({
      activeStepIndex: 0,
      elapsedMs: 0,
      status: "PLAYING",
    });
  });

  test("playing a completed timeline starts it from the beginning", () => {
    const completed: FlowPlaybackState = {
      activeStepIndex: 3,
      elapsedMs: timeline.durationMs,
      status: "COMPLETED",
    };

    expect(reduceFlowPlayback(completed, { type: "PLAY" }, timeline)).toEqual({
      activeStepIndex: 0,
      elapsedMs: 0,
      status: "PLAYING",
    });
  });

  test("rejects invalid elapsed time and step selection", () => {
    const state = createInitialFlowPlaybackState(timeline);

    expect(() => reduceFlowPlayback(state, { type: "ADVANCE", deltaMs: -1 }, timeline)).toThrow(RangeError);
    expect(() => reduceFlowPlayback(state, { type: "SELECT_STEP", stepIndex: 4 }, timeline)).toThrow(RangeError);
  });
});
