import { flowTraceScenarioIds, type FlowTraceScenarioId } from "./flowTrace";

export interface FlowTraceCatalogEntry {
  id: FlowTraceScenarioId;
  artifactUrl: string;
}

export const flowTraceCatalog = {
  "erp-b-success": { id: "erp-b-success", artifactUrl: "/flow-traces/v1/erp-b-success.json" },
  "erp-b-poison-item": { id: "erp-b-poison-item", artifactUrl: "/flow-traces/v1/erp-b-poison-item.json" },
  "erp-b-authentication-rejection": {
    id: "erp-b-authentication-rejection",
    artifactUrl: "/flow-traces/v1/erp-b-authentication-rejection.json",
  },
} as const satisfies Record<FlowTraceScenarioId, FlowTraceCatalogEntry>;

export const flowTraceCatalogEntries = flowTraceScenarioIds.map((scenarioId) => flowTraceCatalog[scenarioId]);

export function getFlowTraceCatalogEntry(id: FlowTraceScenarioId): FlowTraceCatalogEntry {
  return flowTraceCatalog[id];
}
