import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Database,
  Globe2,
  MonitorCog,
  Radio,
  Search,
  Server,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../components/ui/PageHeader";

type SystemNodeProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  optional?: boolean;
};

export function SystemMapPage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="system-map-heading">
      <PageHeader
        titleId="system-map-heading"
        title={t("systemMap.title")}
        description={t("systemMap.description")}
      />

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-app-foreground-muted">
        <span className="font-semibold text-app-foreground-secondary">{t("systemMap.legend.title")}</span>
        <LegendItem optional={false} label={t("systemMap.legend.implemented")} />
        <LegendItem optional label={t("systemMap.legend.optional")} />
      </div>

      <section aria-labelledby="ingestion-heading" className="mt-6">
        <h2 id="ingestion-heading" className="text-sm font-semibold text-app-foreground">
          {t("systemMap.ingestion.title")}
        </h2>

        <div className="mt-3 overflow-x-auto border-y border-app-border py-5">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)] items-center gap-3">
              <SystemNode
                icon={Globe2}
                title={t("systemMap.ingestion.source.title")}
                description={t("systemMap.ingestion.source.description")}
              />
              <MapArrow label={t("systemMap.links.signedWebhook")} />
              <SystemNode
                icon={Server}
                title={t("systemMap.ingestion.gateway.title")}
                description={t("systemMap.ingestion.gateway.description")}
              />
              <MapArrow label={t("systemMap.links.normalizedHttp")} />
              <SystemNode
                icon={Workflow}
                title={t("systemMap.ingestion.core.title")}
                description={t("systemMap.ingestion.core.description")}
              />
              <MapArrow label={t("systemMap.links.canonicalEvent")} />
              <SystemNode
                icon={Radio}
                title={t("systemMap.ingestion.events.title")}
                description={t("systemMap.ingestion.events.description")}
              />
              <MapArrow label={t("systemMap.links.consumes")} />
              <SystemNode
                icon={Workflow}
                title={t("systemMap.ingestion.processor.title")}
                description={t("systemMap.ingestion.processor.description")}
              />
            </div>

            <div className="mt-5 grid grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)] items-start gap-3">
              <div />
              <div />
              <div className="flex flex-col items-center gap-2">
                <ArrowDown aria-hidden="true" className="text-app-foreground-faint" size={20} />
                <span className="text-center text-xs text-app-foreground-muted">{t("systemMap.links.deliveryState")}</span>
                <SystemNode
                  icon={Database}
                  title={t("systemMap.storage.gateway.title")}
                  description={t("systemMap.storage.gateway.description")}
                />
              </div>
              <div />
              <div className="flex flex-col items-center gap-2">
                <ArrowDown aria-hidden="true" className="text-app-foreground-faint" size={20} />
                <span className="text-center text-xs text-app-foreground-muted">{t("systemMap.links.workflowState")}</span>
                <SystemNode
                  icon={Database}
                  title={t("systemMap.storage.core.title")}
                  description={t("systemMap.storage.core.description")}
                />
              </div>
              <div />
              <div />
              <div />
              <div className="flex flex-col items-center gap-2">
                <ArrowDown aria-hidden="true" className="text-app-foreground-faint" size={20} />
                <span className="text-center text-xs text-app-foreground-muted">{t("systemMap.links.projects")}</span>
                <SystemNode
                  icon={Search}
                  title={t("systemMap.storage.search.title")}
                  description={t("systemMap.storage.search.description")}
                  optional
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="operations-heading" className="mt-8">
        <h2 id="operations-heading" className="text-sm font-semibold text-app-foreground">
          {t("systemMap.operations.title")}
        </h2>

        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <SystemNode
            icon={MonitorCog}
            title={t("systemMap.operations.console.title")}
            description={t("systemMap.operations.console.description")}
          />
          <SystemNode
            icon={Globe2}
            title={t("systemMap.operations.simulator.title")}
            description={t("systemMap.operations.simulator.description")}
            optional
          />
          <SystemNode
            icon={BarChart3}
            title={t("systemMap.operations.observability.title")}
            description={t("systemMap.operations.observability.description")}
            optional
          />
        </div>
      </section>
    </section>
  );
}

function LegendItem({ label, optional }: { label: string; optional: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={optional ? "h-px w-6 border-t border-dashed border-app-border-strong" : "h-px w-6 bg-app-foreground-secondary"}
      />
      {label}
    </span>
  );
}

function MapArrow({ label }: { label: string }) {
  return (
    <div className="flex w-24 flex-col items-center gap-1 text-center text-xs text-app-foreground-muted">
      <ArrowRight aria-hidden="true" className="text-app-foreground-faint" size={20} />
      <span>{label}</span>
    </div>
  );
}

function SystemNode({ icon: Icon, title, description, optional = false }: SystemNodeProps) {
  return (
    <article
      className={[
        "min-h-32 border bg-app-surface p-4",
        optional ? "border-dashed border-app-border-strong" : "border-app-border",
      ].join(" ")}
    >
      <Icon aria-hidden="true" className="text-app-brand-primary" size={20} strokeWidth={1.8} />
      <h3 className="mt-3 text-sm font-semibold text-app-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-app-foreground-muted">{description}</p>
    </article>
  );
}
