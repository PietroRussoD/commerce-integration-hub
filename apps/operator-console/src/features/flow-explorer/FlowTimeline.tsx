import { Ban, Check, Circle, CircleAlert, type LucideIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FlowStep } from "./flowTrace";

export interface FlowTimelineProps {
  readonly activeStepIndex: number;
  readonly activeStepDetails?: ReactNode;
  readonly onSelectStep: (stepIndex: number) => void;
  readonly steps: readonly FlowStep[];
}

const statusIcons: Record<FlowStep["status"], LucideIcon> = {
  BLOCKED: CircleAlert,
  INFORMATIONAL: Circle,
  REJECTED: Ban,
  SUCCEEDED: Check,
};

const statusClassNames: Record<FlowStep["status"], string> = {
  BLOCKED: "border-amber-500 bg-amber-50 text-amber-800",
  INFORMATIONAL: "border-sky-500 bg-sky-50 text-sky-800",
  REJECTED: "border-red-500 bg-red-50 text-red-800",
  SUCCEEDED: "border-emerald-500 bg-emerald-50 text-emerald-800",
};

export function FlowTimeline({ activeStepIndex, activeStepDetails, onSelectStep, steps }: FlowTimelineProps) {
  const { t } = useTranslation();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  function selectAndFocus(stepIndex: number): void {
    onSelectStep(stepIndex);
    buttonRefs.current[stepIndex]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, stepIndex: number): void {
    const destination = keyboardDestination(event.key, stepIndex, steps.length);
    if (destination === undefined) {
      return;
    }

    event.preventDefault();
    selectAndFocus(destination);
  }

  return (
    <section aria-label={t("flowExplorer.timeline.ariaLabel")}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-app-foreground">{t("flowExplorer.timeline.title")}</h2>
        <span className="text-xs text-app-foreground-muted">
          {t("flowExplorer.timeline.progress", {
            current: steps[activeStepIndex]?.sequence ?? 0,
            total: steps.length,
          })}
        </span>
      </div>

      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls="flow-timeline-steps"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="mt-3 inline-flex min-h-10 items-center rounded-md border border-app-border px-3 text-sm font-medium text-app-foreground-secondary hover:bg-app-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus xl:hidden"
      >
        {t(isExpanded ? "flowExplorer.timeline.hideAllSteps" : "flowExplorer.timeline.showAllSteps", { total: steps.length })}
      </button>

      <ol
        id="flow-timeline-steps"
        className={`mt-3 space-y-1.5 ${isExpanded ? "" : "hidden xl:block"}`}
      >
        {steps.map((step, stepIndex) => {
          const Icon = statusIcons[step.status];
          const isActive = stepIndex === activeStepIndex;

          return (
            <li key={step.id} className="relative pl-7">
              {stepIndex < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-[-0.5rem] left-[0.6875rem] top-6 w-px bg-app-border"
                />
              ) : null}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-3 flex size-6 items-center justify-center rounded-full border ${statusClassNames[step.status]}`}
              >
                <Icon size={13} strokeWidth={2.25} />
              </span>

              <button
                ref={(element) => {
                  buttonRefs.current[stepIndex] = element;
                }}
                type="button"
                aria-current={isActive ? "step" : undefined}
                aria-label={t("flowExplorer.timeline.stepLabel", {
                  eventType: step.eventType,
                  sequence: step.sequence,
                  status: t(`flowExplorer.timeline.status.${step.status}`),
                })}
                onClick={() => onSelectStep(stepIndex)}
                onKeyDown={(event) => handleKeyDown(event, stepIndex)}
                className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-brand-primary focus-visible:ring-offset-2 ${
                  isActive
                    ? "border-app-brand-primary bg-app-brand-soft"
                    : "border-transparent hover:border-app-border hover:bg-app-surface-secondary"
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase text-app-foreground-muted">
                    {t(`flowExplorer.timeline.phases.${step.phase}`)}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-app-foreground-muted">
                    {formatOffset(step.offsetMs)}
                  </span>
                </span>
                <span className="mt-1 block break-words font-mono text-xs font-semibold text-app-foreground">
                  {step.eventType}
                </span>
              </button>
              {isActive && activeStepDetails !== undefined ? (
                <div data-testid="flow-timeline-active-details" className="mt-3 xl:hidden">
                  {activeStepDetails}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function keyboardDestination(key: string, currentIndex: number, stepCount: number): number | undefined {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(currentIndex + 1, stepCount - 1);
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(currentIndex - 1, 0);
    case "Home":
      return 0;
    case "End":
      return stepCount - 1;
    default:
      return undefined;
  }
}

function formatOffset(offsetMs: number): string {
  if (offsetMs < 1_000) {
    return `+${offsetMs} ms`;
  }
  return `+${(offsetMs / 1_000).toFixed(2)} s`;
}
