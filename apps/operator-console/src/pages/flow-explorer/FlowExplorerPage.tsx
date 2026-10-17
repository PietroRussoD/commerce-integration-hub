import { RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../components/ui/PageHeader";
import { FlowPlaybackControls } from "../../features/flow-explorer/FlowPlaybackControls";
import { FlowScenarioSelector } from "../../features/flow-explorer/FlowScenarioSelector";
import { FlowStage } from "../../features/flow-explorer/FlowStage";
import { FlowStepDetails } from "../../features/flow-explorer/FlowStepDetails";
import { FlowTimeline } from "../../features/flow-explorer/FlowTimeline";
import type { FlowTrace, FlowTraceScenarioId } from "../../features/flow-explorer/flowTrace";
import { useFlowPlayback } from "../../features/flow-explorer/useFlowPlayback";
import { useFlowTrace } from "../../features/flow-explorer/useFlowTrace";

const defaultScenarioId: FlowTraceScenarioId = "erp-b-success";

export function FlowExplorerPage() {
  const { t } = useTranslation();
  const [scenarioId, setScenarioId] = useState<FlowTraceScenarioId>(defaultScenarioId);
  const traceQuery = useFlowTrace(scenarioId);

  return (
    <section aria-labelledby="flow-explorer-heading">
      <PageHeader
        titleId="flow-explorer-heading"
        title={t("flowExplorer.page.title")}
        description={t("flowExplorer.page.description")}
      />

      <div className="mt-5">
        <FlowScenarioSelector selectedScenarioId={scenarioId} onSelectScenario={setScenarioId} />
      </div>

      {traceQuery.isPending ? <FlowTraceLoading /> : null}
      {traceQuery.isError ? <FlowTraceError onRetry={() => void traceQuery.refetch()} /> : null}
      {traceQuery.data === undefined ? null : <FlowExplorerContent trace={traceQuery.data} />}
    </section>
  );
}

function FlowExplorerContent({ trace }: { trace: FlowTrace }) {
  const { t } = useTranslation();
  const playback = useFlowPlayback(trace);

  return (
    <div className="mt-6">
      <FlowPlaybackControls
        activeStepIndex={playback.state.activeStepIndex}
        onPause={playback.pause}
        onPlay={playback.play}
        onRestart={playback.restart}
        onSelectStep={playback.selectStep}
        progress={playback.progress}
        status={playback.state.status}
        stepCount={trace.steps.length}
      />

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          <FlowStage activeStep={playback.activeStep} participants={trace.participants} />
          <FlowStepDetails
            step={playback.activeStep}
            participants={trace.participants}
            regionLabel={t("flowExplorer.stepDetails.activeRegion")}
          />
        </div>
        <FlowTimeline
          steps={trace.steps}
          activeStepIndex={playback.state.activeStepIndex}
          onSelectStep={playback.selectStep}
          activeStepDetails={
            <FlowStepDetails
              step={playback.activeStep}
              participants={trace.participants}
              idPrefix="flow-step-details-inline"
              regionLabel={t("flowExplorer.timeline.selectedDetails")}
            />
          }
        />
      </div>
    </div>
  );
}

function FlowTraceLoading() {
  const { t } = useTranslation();

  return (
    <div role="status" className="mt-6 border-y border-app-border px-4 py-12 text-center">
      <span className="inline-block size-5 animate-spin rounded-full border-2 border-app-border-strong border-t-app-brand-primary motion-reduce:animate-none" />
      <p className="mt-3 text-sm text-app-foreground-muted">{t("flowExplorer.page.loading")}</p>
    </div>
  );
}

function FlowTraceError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div role="alert" className="mt-6 flex flex-col items-center border-y border-red-200 bg-red-50 px-6 py-12 text-center">
      <TriangleAlert aria-hidden="true" className="text-red-700" size={24} />
      <p className="mt-3 font-medium text-red-950">{t("flowExplorer.page.error")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-red-950 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
      >
        <RefreshCw aria-hidden="true" size={16} />
        {t("flowExplorer.page.retry")}
      </button>
    </div>
  );
}
