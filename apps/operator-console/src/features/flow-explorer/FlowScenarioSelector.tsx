import { CircleCheck, ShieldX, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { StatusBadge } from "../../components/ui/StatusBadge";
import type { FlowTraceScenarioId } from "./flowTrace";
import { flowTraceCatalogEntries } from "./flowTraceCatalog";

export interface FlowScenarioSelectorProps {
  readonly onSelectScenario: (scenarioId: FlowTraceScenarioId) => void;
  readonly selectedScenarioId: FlowTraceScenarioId;
}

interface ScenarioPresentation {
  readonly icon: LucideIcon;
  readonly status: "SUCCEEDED" | "REJECTED" | "BLOCKED";
}

const scenarioPresentation: Record<FlowTraceScenarioId, ScenarioPresentation> = {
  "erp-b-success": { icon: CircleCheck, status: "SUCCEEDED" },
  "erp-b-poison-item": { icon: TriangleAlert, status: "REJECTED" },
  "erp-b-authentication-rejection": { icon: ShieldX, status: "BLOCKED" },
};

export function FlowScenarioSelector({
  onSelectScenario,
  selectedScenarioId,
}: FlowScenarioSelectorProps) {
  const { t } = useTranslation();

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-semibold text-app-foreground">
        {t("flowExplorer.scenarios.title")}
      </legend>
      <p className="mt-1 text-xs text-app-foreground-muted">{t("flowExplorer.scenarios.description")}</p>

      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {flowTraceCatalogEntries.map(({ id }) => {
          const presentation = scenarioPresentation[id];
          const Icon = presentation.icon;
          const descriptionId = `flow-scenario-${id}-description`;

          return (
            <label key={id} className="relative block min-w-0 cursor-pointer">
              <input
                type="radio"
                name="flow-scenario"
                value={id}
                checked={selectedScenarioId === id}
                aria-label={t(`flowExplorer.scenarios.items.${id}.title`)}
                aria-describedby={descriptionId}
                onChange={() => onSelectScenario(id)}
                className="peer sr-only"
              />
              <span className="flex min-h-36 flex-col rounded-md border border-app-border bg-app-surface p-4 transition-colors hover:border-app-border-strong peer-checked:border-app-brand-primary peer-checked:bg-app-brand-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-app-brand-focus">
                <span className="flex items-start justify-between gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 shrink-0 text-app-foreground-secondary" size={19} />
                  <StatusBadge status={presentation.status}>
                    {t(`flowExplorer.timeline.status.${presentation.status}`)}
                  </StatusBadge>
                </span>
                <span className="mt-3 block text-sm font-semibold text-app-foreground">
                  {t(`flowExplorer.scenarios.items.${id}.title`)}
                </span>
                <span
                  id={descriptionId}
                  className="mt-1 block text-xs leading-relaxed text-app-foreground-secondary"
                >
                  {t(`flowExplorer.scenarios.items.${id}.description`)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
