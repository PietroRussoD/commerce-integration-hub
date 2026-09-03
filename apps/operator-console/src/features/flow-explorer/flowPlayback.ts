import type { FlowTrace } from "./flowTrace";

const DEFAULT_MINIMUM_TRANSITION_MS = 600;
const DEFAULT_MAXIMUM_TRANSITION_MS = 1_600;

export interface FlowPlaybackTimeline {
  readonly durationMs: number;
  readonly stepOffsetsMs: readonly number[];
}

export interface FlowPlaybackOptions {
  readonly maximumTransitionMs?: number;
  readonly minimumTransitionMs?: number;
}

export type FlowPlaybackStatus = "PLAYING" | "PAUSED" | "COMPLETED";

export interface FlowPlaybackState {
  readonly activeStepIndex: number;
  readonly elapsedMs: number;
  readonly status: FlowPlaybackStatus;
}

export type FlowPlaybackAction =
  | { readonly type: "ADVANCE"; readonly deltaMs: number }
  | { readonly type: "PAUSE" }
  | { readonly type: "PLAY" }
  | { readonly type: "RESTART" }
  | { readonly type: "SELECT_STEP"; readonly stepIndex: number };

export function createFlowPlaybackTimeline(
  trace: FlowTrace,
  options: FlowPlaybackOptions = {},
): FlowPlaybackTimeline {
  const minimumTransitionMs = options.minimumTransitionMs ?? DEFAULT_MINIMUM_TRANSITION_MS;
  const maximumTransitionMs = options.maximumTransitionMs ?? DEFAULT_MAXIMUM_TRANSITION_MS;
  validateTransitionRange(minimumTransitionMs, maximumTransitionMs);

  const stepOffsetsMs = trace.steps.reduce<number[]>((offsets, step, index) => {
    if (index === 0) {
      offsets.push(0);
      return offsets;
    }

    const previousStep = trace.steps[index - 1];
    const actualTransitionMs = step.offsetMs - previousStep.offsetMs;
    const playbackTransitionMs = Math.min(
      maximumTransitionMs,
      Math.max(minimumTransitionMs, actualTransitionMs),
    );
    offsets.push(offsets[index - 1] + playbackTransitionMs);
    return offsets;
  }, []);

  return {
    durationMs: stepOffsetsMs.at(-1) ?? 0,
    stepOffsetsMs,
  };
}

export function createInitialFlowPlaybackState(
  timeline: FlowPlaybackTimeline,
  autoPlay = true,
): FlowPlaybackState {
  return {
    activeStepIndex: 0,
    elapsedMs: 0,
    status: autoPlay && timeline.durationMs > 0 ? "PLAYING" : timeline.durationMs === 0 ? "COMPLETED" : "PAUSED",
  };
}

export function reduceFlowPlayback(
  state: FlowPlaybackState,
  action: FlowPlaybackAction,
  timeline: FlowPlaybackTimeline,
): FlowPlaybackState {
  switch (action.type) {
    case "ADVANCE":
      return advance(state, action.deltaMs, timeline);
    case "PAUSE":
      return state.status === "PLAYING" ? { ...state, status: "PAUSED" } : state;
    case "PLAY":
      return play(state);
    case "RESTART":
      return { activeStepIndex: 0, elapsedMs: 0, status: timeline.durationMs > 0 ? "PLAYING" : "COMPLETED" };
    case "SELECT_STEP":
      return selectStep(action.stepIndex, timeline);
  }
}

function advance(
  state: FlowPlaybackState,
  deltaMs: number,
  timeline: FlowPlaybackTimeline,
): FlowPlaybackState {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    throw new RangeError("deltaMs must be a finite non-negative number");
  }
  if (state.status !== "PLAYING") {
    return state;
  }

  const elapsedMs = Math.min(state.elapsedMs + deltaMs, timeline.durationMs);
  return {
    activeStepIndex: findActiveStepIndex(timeline.stepOffsetsMs, elapsedMs),
    elapsedMs,
    status: elapsedMs === timeline.durationMs ? "COMPLETED" : "PLAYING",
  };
}

function play(state: FlowPlaybackState): FlowPlaybackState {
  if (state.status === "PLAYING") {
    return state;
  }
  if (state.status === "COMPLETED") {
    return { activeStepIndex: 0, elapsedMs: 0, status: "PLAYING" };
  }
  return { ...state, status: "PLAYING" };
}

function selectStep(stepIndex: number, timeline: FlowPlaybackTimeline): FlowPlaybackState {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= timeline.stepOffsetsMs.length) {
    throw new RangeError("stepIndex must reference the playback timeline");
  }
  return {
    activeStepIndex: stepIndex,
    elapsedMs: timeline.stepOffsetsMs[stepIndex],
    status: stepIndex === timeline.stepOffsetsMs.length - 1 ? "COMPLETED" : "PAUSED",
  };
}

function findActiveStepIndex(stepOffsetsMs: readonly number[], elapsedMs: number): number {
  for (let index = stepOffsetsMs.length - 1; index >= 0; index -= 1) {
    if (elapsedMs >= stepOffsetsMs[index]) {
      return index;
    }
  }
  return 0;
}

function validateTransitionRange(minimumTransitionMs: number, maximumTransitionMs: number): void {
  if (
    !Number.isFinite(minimumTransitionMs) ||
    !Number.isFinite(maximumTransitionMs) ||
    minimumTransitionMs <= 0 ||
    maximumTransitionMs < minimumTransitionMs
  ) {
    throw new RangeError("Playback transitions require a positive and ordered range");
  }
}
