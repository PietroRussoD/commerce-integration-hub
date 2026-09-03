import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "../../components/ui/IconButton";
import type { FlowPlaybackStatus } from "./flowPlayback";

export interface FlowPlaybackControlsProps {
  readonly activeStepIndex: number;
  readonly onPause: () => void;
  readonly onPlay: () => void;
  readonly onRestart: () => void;
  readonly onSelectStep: (stepIndex: number) => void;
  readonly progress: number;
  readonly status: FlowPlaybackStatus;
  readonly stepCount: number;
}

export function FlowPlaybackControls({
  activeStepIndex,
  onPause,
  onPlay,
  onRestart,
  onSelectStep,
  progress,
  status,
  stepCount,
}: FlowPlaybackControlsProps) {
  const { t } = useTranslation();
  const normalizedProgress = Math.min(1, Math.max(0, progress));
  const progressPercentage = Math.round(normalizedProgress * 100);
  const isPlaying = status === "PLAYING";
  const hasPreviousStep = activeStepIndex > 0;
  const hasNextStep = activeStepIndex < stepCount - 1;

  return (
    <section aria-label={t("flowExplorer.playback.ariaLabel")} className="border-y border-app-border py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-foreground">{t("flowExplorer.playback.title")}</p>
          <p className="mt-0.5 text-xs text-app-foreground-muted">
            {t("flowExplorer.playback.progress", {
              current: stepCount === 0 ? 0 : activeStepIndex + 1,
              total: stepCount,
            })}
            {" · "}
            {t(`flowExplorer.playback.status.${status}`)}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton label={t("flowExplorer.playback.actions.restart")} onClick={onRestart}>
            <RotateCcw aria-hidden="true" size={17} />
          </IconButton>
          <IconButton
            label={t("flowExplorer.playback.actions.previous")}
            disabled={!hasPreviousStep}
            onClick={() => onSelectStep(activeStepIndex - 1)}
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </IconButton>
          {isPlaying ? (
            <IconButton label={t("flowExplorer.playback.actions.pause")} onClick={onPause}>
              <Pause aria-hidden="true" fill="currentColor" size={16} />
            </IconButton>
          ) : (
            <IconButton label={t("flowExplorer.playback.actions.play")} onClick={onPlay}>
              <Play aria-hidden="true" fill="currentColor" size={16} />
            </IconButton>
          )}
          <IconButton
            label={t("flowExplorer.playback.actions.next")}
            disabled={!hasNextStep}
            onClick={() => onSelectStep(activeStepIndex + 1)}
          >
            <ChevronRight aria-hidden="true" size={18} />
          </IconButton>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label={t("flowExplorer.playback.progressLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercentage}
        className="mx-4 mt-4 h-1.5 overflow-hidden rounded bg-app-border sm:mx-5"
      >
        <div
          aria-hidden="true"
          className="h-full bg-app-brand-primary transition-[width] motion-reduce:transition-none"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </section>
  );
}
