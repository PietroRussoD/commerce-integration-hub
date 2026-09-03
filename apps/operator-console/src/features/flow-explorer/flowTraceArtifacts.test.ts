import { expect, test } from "vitest";

import erpBSuccessTrace from "../../../public/flow-traces/v1/erp-b-success.json";
import { parseFlowTrace } from "./flowTrace";

test("validates the captured ERP_B success artifact", () => {
  const trace = parseFlowTrace(erpBSuccessTrace);

  expect(trace.scenario).toEqual({ id: "erp-b-success", sourceSystem: "ERP_B", outcome: "SUCCEEDED" });
  expect(trace.steps.at(-1)).toMatchObject({ kind: "OUTCOME", status: "SUCCEEDED" });
});
