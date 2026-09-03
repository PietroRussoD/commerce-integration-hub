import { expect, test } from "vitest";

import { flowTraceScenarioIds } from "./flowTrace";
import { flowTraceCatalogEntries, getFlowTraceCatalogEntry } from "./flowTraceCatalog";

test("registers every v1 scenario exactly once", () => {
  expect(flowTraceCatalogEntries.map((entry) => entry.id)).toEqual(flowTraceScenarioIds);
  expect(new Set(flowTraceCatalogEntries.map((entry) => entry.id)).size).toBe(flowTraceCatalogEntries.length);
});

test.each(flowTraceCatalogEntries)("maps $id to a versioned JSON artifact", ({ id, artifactUrl }) => {
  expect(getFlowTraceCatalogEntry(id)).toEqual({ id, artifactUrl });
  expect(artifactUrl).toMatch(/^\/flow-traces\/v1\/[a-z0-9-]+\.json$/);
});
