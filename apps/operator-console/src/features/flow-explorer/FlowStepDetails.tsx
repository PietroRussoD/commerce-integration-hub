import { useTranslation } from "react-i18next";

import { StatusBadge } from "../../components/ui/StatusBadge";
import type { FlowParticipant, FlowStep } from "./flowTrace";

export interface FlowStepDetailsProps {
  readonly participants: readonly FlowParticipant[];
  readonly step: FlowStep;
}

export function FlowStepDetails({ participants, step }: FlowStepDetailsProps) {
  const { t } = useTranslation();
  const source = findParticipantLabel(participants, step.sourceParticipantId);
  const destination =
    step.targetParticipantId === undefined
      ? t("flowExplorer.stepDetails.outcome")
      : findParticipantLabel(participants, step.targetParticipantId);

  return (
    <section aria-labelledby="flow-step-details-title" className="border-y border-app-border bg-app-surface py-5">
      <div className="px-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-app-foreground-muted">
              {t("flowExplorer.stepDetails.step", { sequence: step.sequence })}
            </p>
            <h2
              id="flow-step-details-title"
              className="mt-1 break-words font-mono text-sm font-semibold text-app-foreground"
            >
              {step.eventType}
            </h2>
          </div>
          <StatusBadge status={step.status}>{t(`flowExplorer.timeline.status.${step.status}`)}</StatusBadge>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Detail name={t("flowExplorer.stepDetails.phase")} value={t(`flowExplorer.timeline.phases.${step.phase}`)} />
          <Detail name={t("flowExplorer.stepDetails.kind")} value={t(`flowExplorer.stepDetails.kinds.${step.kind}`)} />
          <Detail name={t("flowExplorer.stepDetails.source")} value={source} />
          <Detail name={t("flowExplorer.stepDetails.destination")} value={destination} />
        </dl>
      </div>

      <div className="mt-5 border-t border-app-border px-4 pt-5 sm:px-5">
        <h3 className="text-xs font-semibold uppercase text-app-foreground-muted">
          {t("flowExplorer.stepDetails.evidence")}
        </h3>
        {step.evidence.length === 0 ? (
          <p className="mt-2 text-sm text-app-foreground-secondary">
            {t("flowExplorer.stepDetails.noEvidence")}
          </p>
        ) : (
          <dl className="mt-2 divide-y divide-app-border border-y border-app-border">
            {step.evidence.map((fact) => (
              <div key={fact.name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="break-words font-mono text-xs text-app-foreground-muted">{fact.name}</dt>
                <dd className="break-words text-right font-mono text-xs font-semibold text-app-foreground">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

function Detail({ name, value }: { name: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-app-foreground-muted">{name}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-app-foreground">{value}</dd>
    </div>
  );
}

function findParticipantLabel(participants: readonly FlowParticipant[], participantId: string): string {
  const participant = participants.find(({ id }) => id === participantId);
  if (participant === undefined) {
    throw new Error(`Unknown flow participant: ${participantId}`);
  }
  return participant.label;
}
