import { expect, test } from "vitest";

import erpBAuthenticationRejectionTrace from "../../../public/flow-traces/v1/erp-b-authentication-rejection.json";
import erpBPoisonItemTrace from "../../../public/flow-traces/v1/erp-b-poison-item.json";
import erpBSuccessTrace from "../../../public/flow-traces/v1/erp-b-success.json";
import { parseFlowTrace } from "./flowTrace";

test("validates the captured ERP_B success artifact", () => {
  const trace = parseFlowTrace(erpBSuccessTrace);

  expect(trace.scenario).toEqual({ id: "erp-b-success", sourceSystem: "ERP_B", outcome: "SUCCEEDED" });
  expect(trace.steps.at(-1)).toMatchObject({ kind: "OUTCOME", status: "SUCCEEDED" });
});

test("validates the captured ERP_B poison-item artifact", () => {
  const trace = parseFlowTrace(erpBPoisonItemTrace);

  expect(trace.scenario).toEqual({
    id: "erp-b-poison-item",
    sourceSystem: "ERP_B",
    outcome: "COMPLETED_WITH_REJECTIONS",
  });
  expect(trace.participants.map((participant) => participant.id)).not.toContain("integration-core");
  expect(trace.steps).toContainEqual(
    expect.objectContaining({ eventType: "ERP_ITEM_REJECTED", status: "REJECTED" }),
  );
  expect(trace.steps.at(-1)).toMatchObject({ kind: "OUTCOME", status: "REJECTED" });
});

test("validates the captured ERP_B authentication-rejection artifact", () => {
  const trace = parseFlowTrace(erpBAuthenticationRejectionTrace);

  expect(trace.scenario).toEqual({
    id: "erp-b-authentication-rejection",
    sourceSystem: "ERP_B",
    outcome: "BLOCKED_CONFIGURATION",
  });
  expect(trace.participants.map((participant) => participant.id)).not.toContain("integration-core");
  expect(trace.steps).toContainEqual(
    expect.objectContaining({ eventType: "CONNECTOR_CONFIGURATION_BLOCKED", status: "BLOCKED" }),
  );
  expect(trace.steps.at(-1)).toMatchObject({ kind: "OUTCOME", status: "BLOCKED" });
});
