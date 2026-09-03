import { useQuery } from "@tanstack/react-query";

import { flowTraceSchemaVersion, type FlowTraceScenarioId } from "./flowTrace";
import { getFlowTraceCatalogEntry } from "./flowTraceCatalog";
import { loadFlowTrace } from "./loadFlowTrace";

export function useFlowTrace(scenarioId: FlowTraceScenarioId) {
  const catalogEntry = getFlowTraceCatalogEntry(scenarioId);

  return useQuery({
    queryKey: ["flow-trace", flowTraceSchemaVersion, scenarioId],
    queryFn: ({ signal }) => loadFlowTrace({ url: catalogEntry.artifactUrl, signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
