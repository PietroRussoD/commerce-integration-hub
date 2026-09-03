import { useCallback, useEffect, useMemo, useState } from "react";

import type { FlowStep, FlowTrace } from "./flowTrace";
import {
  createFlowPlaybackTimeline,
  createInitialFlowPlaybackState,
  reduceFlowPlayback,
  type FlowPlaybackAction,
  type FlowPlaybackState,
  type FlowPlaybackTimeline,
} from "./flowPlayback";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export interface UseFlowPlaybackOptions {
  readonly autoPlay?: boolean;
  readonly reducedMotion?: boolean;
}

export interface UseFlowPlaybackResult {
  readonly activeStep: FlowStep;
  readonly pause: () => void;
  readonly play: () => void;
  readonly progress: number;
  readonly reducedMotion: boolean;
  readonly restart: () => void;
  readonly selectStep: (stepIndex: number) => void;
  readonly state: FlowPlaybackState;
  readonly timeline: FlowPlaybackTimeline;
}

interface FlowPlaybackSession {
  readonly autoPlay: boolean;
  readonly state: FlowPlaybackState;
  readonly timeline: FlowPlaybackTimeline;
  readonly traceId: string;
}

export function useFlowPlayback(
  trace: FlowTrace,
  { autoPlay = true, reducedMotion: reducedMotionOverride }: UseFlowPlaybackOptions = {},
): UseFlowPlaybackResult {
  const systemReducedMotion = usePrefersReducedMotion();
  const reducedMotion = reducedMotionOverride ?? systemReducedMotion;
  const timeline = useMemo(() => createFlowPlaybackTimeline(trace), [trace]);
  const shouldAutoPlay = autoPlay && !reducedMotion;
  const initialState = useMemo(
    () => createInitialFlowPlaybackState(timeline, shouldAutoPlay),
    [shouldAutoPlay, timeline],
  );
  const [session, setSession] = useState<FlowPlaybackSession>(() => ({
    autoPlay: shouldAutoPlay,
    state: initialState,
    timeline,
    traceId: trace.traceId,
  }));
  const sessionIsCurrent =
    session.traceId === trace.traceId && session.timeline === timeline && session.autoPlay === shouldAutoPlay;
  const state = sessionIsCurrent ? session.state : initialState;
  const dispatch = useCallback(
    (action: FlowPlaybackAction) => {
      setSession((current) => {
        const currentIsCompatible =
          current.traceId === trace.traceId && current.timeline === timeline && current.autoPlay === shouldAutoPlay;
        const currentState = currentIsCompatible ? current.state : initialState;
        return {
          autoPlay: shouldAutoPlay,
          state: reduceFlowPlayback(currentState, action, timeline),
          timeline,
          traceId: trace.traceId,
        };
      });
    },
    [initialState, shouldAutoPlay, timeline, trace.traceId],
  );

  useEffect(() => {
    if (state.status !== "PLAYING") {
      return undefined;
    }

    let animationFrame: number;
    let previousTimestamp: number | undefined;
    const advance = (timestamp: number) => {
      if (previousTimestamp !== undefined) {
        dispatch({ type: "ADVANCE", deltaMs: timestamp - previousTimestamp });
      }
      previousTimestamp = timestamp;
      animationFrame = window.requestAnimationFrame(advance);
    };

    animationFrame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [dispatch, state.status]);

  const play = useCallback(() => dispatch({ type: "PLAY" }), [dispatch]);
  const pause = useCallback(() => dispatch({ type: "PAUSE" }), [dispatch]);
  const restart = useCallback(() => dispatch({ type: "RESTART" }), [dispatch]);
  const selectStep = useCallback(
    (stepIndex: number) => dispatch({ type: "SELECT_STEP", stepIndex }),
    [dispatch],
  );

  return {
    activeStep: trace.steps[state.activeStepIndex],
    pause,
    play,
    progress: timeline.durationMs === 0 ? 1 : state.elapsedMs / timeline.durationMs,
    reducedMotion,
    restart,
    selectStep,
    state,
    timeline,
  };
}
