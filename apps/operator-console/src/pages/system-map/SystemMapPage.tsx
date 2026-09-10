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
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../components/ui/PageHeader";

type SystemNodeProps = {
  nodeId: SystemNodeId;
  icon: LucideIcon;
  title: string;
  description: string;
  optional?: boolean;
  selected: boolean;
  onSelect: (nodeId: SystemNodeId) => void;
};

type SystemNodeId =
  | "source"
  | "gateway"
  | "core"
  | "events"
  | "processor"
  | "gatewayStorage"
  | "coreStorage"
  | "search"
  | "console"
  | "simulator"
  | "observability";

const systemNodeDetails = {
  source: {
    titleKey: "systemMap.ingestion.source.title",
    roleKey: "systemMap.details.source.role",
    interfacesKey: "systemMap.details.source.interfaces",
  },
  gateway: {
    titleKey: "systemMap.ingestion.gateway.title",
    roleKey: "systemMap.details.gateway.role",
    interfacesKey: "systemMap.details.gateway.interfaces",
  },
  core: {
    titleKey: "systemMap.ingestion.core.title",
    roleKey: "systemMap.details.core.role",
    interfacesKey: "systemMap.details.core.interfaces",
  },
  events: {
    titleKey: "systemMap.ingestion.events.title",
    roleKey: "systemMap.details.events.role",
    interfacesKey: "systemMap.details.events.interfaces",
  },
  processor: {
    titleKey: "systemMap.ingestion.processor.title",
    roleKey: "systemMap.details.processor.role",
    interfacesKey: "systemMap.details.processor.interfaces",
  },
  gatewayStorage: {
    titleKey: "systemMap.storage.gateway.title",
    roleKey: "systemMap.details.gatewayStorage.role",
    interfacesKey: "systemMap.details.gatewayStorage.interfaces",
  },
  coreStorage: {
    titleKey: "systemMap.storage.core.title",
    roleKey: "systemMap.details.coreStorage.role",
    interfacesKey: "systemMap.details.coreStorage.interfaces",
  },
  search: {
    titleKey: "systemMap.storage.search.title",
    roleKey: "systemMap.details.search.role",
    interfacesKey: "systemMap.details.search.interfaces",
  },
  console: {
    titleKey: "systemMap.operations.console.title",
    roleKey: "systemMap.details.console.role",
    interfacesKey: "systemMap.details.console.interfaces",
  },
  simulator: {
    titleKey: "systemMap.operations.simulator.title",
    roleKey: "systemMap.details.simulator.role",
    interfacesKey: "systemMap.details.simulator.interfaces",
  },
  observability: {
    titleKey: "systemMap.operations.observability.title",
    roleKey: "systemMap.details.observability.role",
    interfacesKey: "systemMap.details.observability.interfaces",
  },
} as const satisfies Record<SystemNodeId, { titleKey: string; roleKey: string; interfacesKey: string }>;

export function SystemMapPage() {
  const { t } = useTranslation();
  const [selectedNodeId, setSelectedNodeId] = useState<SystemNodeId>("core");
  const selectedNode = systemNodeDetails[selectedNodeId];

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

      <aside
        id="system-map-details"
        aria-live="polite"
        aria-labelledby="system-map-details-heading"
        className="mt-6 border-y border-app-border bg-app-surface px-5 py-4 sm:px-6"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-app-foreground-muted">{t("systemMap.details.title")}</p>
        <h2 id="system-map-details-heading" className="mt-1 text-lg font-semibold text-app-foreground">
          {t(selectedNode.titleKey)}
        </h2>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="font-semibold text-app-foreground-secondary">{t("systemMap.details.role")}</dt>
            <dd className="mt-1 leading-6 text-app-foreground-muted">{t(selectedNode.roleKey)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-app-foreground-secondary">{t("systemMap.details.interfaces")}</dt>
            <dd className="mt-1 leading-6 text-app-foreground-muted">{t(selectedNode.interfacesKey)}</dd>
          </div>
        </dl>
      </aside>

      <section aria-labelledby="ingestion-heading" className="mt-6">
        <h2 id="ingestion-heading" className="text-sm font-semibold text-app-foreground">
          {t("systemMap.ingestion.title")}
        </h2>

        <div className="mt-3 overflow-x-auto border-y border-app-border py-5">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)] items-center gap-3">
              <SystemNode
                nodeId="source"
                icon={Globe2}
                title={t("systemMap.ingestion.source.title")}
                description={t("systemMap.ingestion.source.description")}
                selected={selectedNodeId === "source"}
                onSelect={setSelectedNodeId}
              />
              <MapArrow label={t("systemMap.links.signedWebhook")} />
              <SystemNode
                nodeId="gateway"
                icon={Server}
                title={t("systemMap.ingestion.gateway.title")}
                description={t("systemMap.ingestion.gateway.description")}
                selected={selectedNodeId === "gateway"}
                onSelect={setSelectedNodeId}
              />
              <MapArrow label={t("systemMap.links.normalizedHttp")} />
              <SystemNode
                nodeId="core"
                icon={Workflow}
                title={t("systemMap.ingestion.core.title")}
                description={t("systemMap.ingestion.core.description")}
                selected={selectedNodeId === "core"}
                onSelect={setSelectedNodeId}
              />
              <MapArrow label={t("systemMap.links.canonicalEvent")} />
              <SystemNode
                nodeId="events"
                icon={Radio}
                title={t("systemMap.ingestion.events.title")}
                description={t("systemMap.ingestion.events.description")}
                selected={selectedNodeId === "events"}
                onSelect={setSelectedNodeId}
              />
              <MapArrow label={t("systemMap.links.consumes")} />
              <SystemNode
                nodeId="processor"
                icon={Workflow}
                title={t("systemMap.ingestion.processor.title")}
                description={t("systemMap.ingestion.processor.description")}
                selected={selectedNodeId === "processor"}
                onSelect={setSelectedNodeId}
              />
            </div>

            <div className="mt-5 grid grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)_auto_minmax(10rem,1fr)] items-start gap-3">
              <div />
              <div />
              <div className="flex flex-col items-center gap-2">
                <ArrowDown aria-hidden="true" className="text-app-foreground-faint" size={20} />
                <span className="text-center text-xs text-app-foreground-muted">{t("systemMap.links.deliveryState")}</span>
                <SystemNode
                  nodeId="gatewayStorage"
                  icon={Database}
                  title={t("systemMap.storage.gateway.title")}
                  description={t("systemMap.storage.gateway.description")}
                  selected={selectedNodeId === "gatewayStorage"}
                  onSelect={setSelectedNodeId}
                />
              </div>
              <div />
              <div className="flex flex-col items-center gap-2">
                <ArrowDown aria-hidden="true" className="text-app-foreground-faint" size={20} />
                <span className="text-center text-xs text-app-foreground-muted">{t("systemMap.links.workflowState")}</span>
                <SystemNode
                  nodeId="coreStorage"
                  icon={Database}
                  title={t("systemMap.storage.core.title")}
                  description={t("systemMap.storage.core.description")}
                  selected={selectedNodeId === "coreStorage"}
                  onSelect={setSelectedNodeId}
                />
              </div>
              <div />
              <div />
              <div />
              <div className="flex flex-col items-center gap-2">
                <ArrowDown aria-hidden="true" className="text-app-foreground-faint" size={20} />
                <span className="text-center text-xs text-app-foreground-muted">{t("systemMap.links.projects")}</span>
                <SystemNode
                  nodeId="search"
                  icon={Search}
                  title={t("systemMap.storage.search.title")}
                  description={t("systemMap.storage.search.description")}
                  optional
                  selected={selectedNodeId === "search"}
                  onSelect={setSelectedNodeId}
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
            nodeId="console"
            icon={MonitorCog}
            title={t("systemMap.operations.console.title")}
            description={t("systemMap.operations.console.description")}
            selected={selectedNodeId === "console"}
            onSelect={setSelectedNodeId}
          />
          <SystemNode
            nodeId="simulator"
            icon={Globe2}
            title={t("systemMap.operations.simulator.title")}
            description={t("systemMap.operations.simulator.description")}
            optional
            selected={selectedNodeId === "simulator"}
            onSelect={setSelectedNodeId}
          />
          <SystemNode
            nodeId="observability"
            icon={BarChart3}
            title={t("systemMap.operations.observability.title")}
            description={t("systemMap.operations.observability.description")}
            optional
            selected={selectedNodeId === "observability"}
            onSelect={setSelectedNodeId}
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

function SystemNode({ nodeId, icon: Icon, title, description, optional = false, selected, onSelect }: SystemNodeProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-controls="system-map-details"
      onClick={() => onSelect(nodeId)}
      className={[
        "min-h-32 border bg-app-surface p-4 text-left transition-colors hover:bg-app-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus",
        optional ? "border-dashed border-app-border-strong" : "border-app-border",
        selected ? "border-app-brand-primary ring-1 ring-app-brand-primary" : "",
      ].join(" ")}
    >
      <Icon aria-hidden="true" className="text-app-brand-primary" size={20} strokeWidth={1.8} />
      <h3 className="mt-3 text-sm font-semibold text-app-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-app-foreground-muted">{description}</p>
    </button>
  );
}
