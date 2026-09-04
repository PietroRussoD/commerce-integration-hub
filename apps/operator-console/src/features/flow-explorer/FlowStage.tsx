import { ArrowRight, Cloud, Database, Flag, RadioTower, Server, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FlowParticipant, FlowStep } from "./flowTrace";

export interface FlowStageProps {
  readonly activeStep: FlowStep;
  readonly participants: readonly FlowParticipant[];
}

const participantIcons: Record<FlowParticipant["kind"], LucideIcon> = {
  DATABASE: Database,
  EXTERNAL_SYSTEM: Cloud,
  MESSAGE_BROKER: RadioTower,
  SERVICE: Server,
};

const targetClassNames: Record<FlowStep["status"], string> = {
  BLOCKED: "border-amber-500 bg-amber-50 ring-2 ring-amber-500/25",
  INFORMATIONAL: "border-sky-500 bg-sky-50 ring-2 ring-sky-500/25",
  REJECTED: "border-red-500 bg-red-50 ring-2 ring-red-500/25",
  SUCCEEDED: "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/25",
};

export function FlowStage({ activeStep, participants }: FlowStageProps) {
  const { t } = useTranslation();
  const source = findParticipant(participants, activeStep.sourceParticipantId);
  const target =
    activeStep.targetParticipantId === undefined
      ? undefined
      : findParticipant(participants, activeStep.targetParticipantId);

  return (
    <section aria-label={t("flowExplorer.stage.ariaLabel")} className="border-y border-app-border bg-app-surface py-5">
      <div className="px-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase text-app-foreground-muted">
            {t("flowExplorer.stage.activeEvent")}
          </p>
          <span className="font-mono text-xs text-app-foreground-muted">
            {t("flowExplorer.stage.step", { sequence: activeStep.sequence })}
          </span>
        </div>
        <p className="mt-1 break-words font-mono text-sm font-semibold text-app-foreground">
          {activeStep.eventType}
        </p>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(3rem,1fr)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(5rem,2fr)_minmax(0,1fr)]">
          <ConnectionEndpoint label={source.label} role={t("flowExplorer.stage.source")} />
          <div aria-hidden="true" className="flex min-w-0 items-center text-app-brand-primary">
            <span className="h-px min-w-0 flex-1 bg-current" />
            <ArrowRight className="shrink-0" size={18} strokeWidth={2} />
          </div>
          <ConnectionEndpoint
            label={target?.label ?? t("flowExplorer.stage.outcome")}
            role={target === undefined ? t("flowExplorer.stage.result") : t("flowExplorer.stage.destination")}
            outcome={target === undefined}
          />
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-2 gap-2 border-t border-app-border px-4 pt-5 sm:grid-cols-3 sm:px-5 xl:grid-cols-6">
        {participants.map((participant) => (
          <ParticipantNode key={participant.id} participant={participant} activeStep={activeStep} />
        ))}
      </ol>
    </section>
  );
}

function ConnectionEndpoint({ label, role, outcome = false }: { label: string; role: string; outcome?: boolean }) {
  const Icon = outcome ? Flag : undefined;

  return (
    <div className="min-w-0 text-center">
      <div className="flex items-center justify-center gap-1.5">
        {Icon === undefined ? null : <Icon aria-hidden="true" className="shrink-0" size={14} />}
        <span className="break-words text-sm font-semibold text-app-foreground">{label}</span>
      </div>
      <span className="mt-0.5 block text-xs text-app-foreground-muted">{role}</span>
    </div>
  );
}

function ParticipantNode({ participant, activeStep }: { participant: FlowParticipant; activeStep: FlowStep }) {
  const { t } = useTranslation();
  const Icon = participantIcons[participant.kind];
  const isSource = participant.id === activeStep.sourceParticipantId;
  const isTarget = participant.id === activeStep.targetParticipantId;
  const activity = isSource
    ? t("flowExplorer.stage.source")
    : isTarget
      ? t("flowExplorer.stage.destination")
      : t("flowExplorer.stage.inactive");
  const activeClassName = isSource
    ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500/25"
    : isTarget
      ? targetClassNames[activeStep.status]
      : "border-app-border bg-app-surface";

  return (
    <li
      aria-label={`${participant.label}, ${activity}`}
      data-flow-role={isSource ? "source" : isTarget ? "target" : "inactive"}
      className={`flex min-h-24 min-w-0 flex-col justify-between rounded-md border p-3 ${activeClassName}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon aria-hidden="true" className="shrink-0 text-app-foreground-secondary" size={18} />
        <span className="truncate text-[11px] font-medium uppercase text-app-foreground-muted">
          {t(`flowExplorer.stage.kinds.${participant.kind}`)}
        </span>
      </div>
      <span className="mt-3 break-words text-sm font-semibold leading-snug text-app-foreground">
        {participant.label}
      </span>
    </li>
  );
}

function findParticipant(participants: readonly FlowParticipant[], participantId: string): FlowParticipant {
  const participant = participants.find(({ id }) => id === participantId);
  if (participant === undefined) {
    throw new Error(`Unknown flow participant: ${participantId}`);
  }
  return participant;
}
