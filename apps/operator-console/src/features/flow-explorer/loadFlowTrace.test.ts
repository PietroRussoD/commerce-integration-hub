import { expect, test, vi } from "vitest";

import { flowTraceSchemaVersion } from "./flowTrace";
import { FlowTraceLoadError, loadFlowTrace } from "./loadFlowTrace";

const validTrace = {
  schemaVersion: flowTraceSchemaVersion,
  traceId: "erp-b-success-001",
  scenario: { id: "erp-b-success", sourceSystem: "ERP_B", outcome: "SUCCEEDED" },
  capturedAt: "2026-09-03T06:00:00.000Z",
  durationMs: 100,
  participants: [
    { id: "erp-b", kind: "EXTERNAL_SYSTEM", label: "ERP_B" },
    { id: "connector-gateway", kind: "SERVICE", label: "Connector Gateway" },
  ],
  steps: [
    {
      id: "scenario-completed",
      sequence: 1,
      offsetMs: 100,
      phase: "COMPLETION",
      kind: "OUTCOME",
      eventType: "SCENARIO_COMPLETED",
      sourceParticipantId: "connector-gateway",
      status: "SUCCEEDED",
      evidence: [],
    },
  ],
} as const;

test("loads and validates a JSON flow trace", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(validTrace), { headers: { "Content-Type": "application/json" } }));

  await expect(loadFlowTrace({ url: "/flow-traces/erp-b-success.json", fetcher })).resolves.toEqual(validTrace);
  expect(fetcher).toHaveBeenCalledWith("/flow-traces/erp-b-success.json", {
    headers: { Accept: "application/json" },
    signal: undefined,
  });
});

test("reports network failures without exposing response details", async () => {
  const cause = new TypeError("connection refused");
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(cause);

  const error = await loadFlowTrace({ url: "/flow-traces/unavailable.json", fetcher }).catch(
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(FlowTraceLoadError);
  expect(error).toMatchObject({ failure: "NETWORK", status: undefined, cause });
});

test("preserves cancellation errors", async () => {
  const controller = new AbortController();
  const cancellation = new DOMException("The operation was aborted", "AbortError");
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
    controller.abort();
    throw cancellation;
  });

  await expect(
    loadFlowTrace({ url: "/flow-traces/erp-b-success.json", signal: controller.signal, fetcher }),
  ).rejects.toBe(cancellation);
});

test("reports unsuccessful HTTP responses", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));

  await expect(loadFlowTrace({ url: "/flow-traces/missing.json", fetcher })).rejects.toMatchObject({
    failure: "HTTP",
    status: 404,
  });
});

test.each([null, "text/html", "application/octet-stream"])("rejects the %s content type", async (contentType) => {
  const headers = contentType === null ? undefined : { "Content-Type": contentType };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(validTrace), { headers }));

  await expect(loadFlowTrace({ url: "/flow-traces/erp-b-success.json", fetcher })).rejects.toMatchObject({
    failure: "UNEXPECTED_CONTENT_TYPE",
  });
});

test("reports malformed JSON separately from an invalid trace", async () => {
  const malformedJsonFetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("{", { headers: { "Content-Type": "application/json" } }));
  const invalidTraceFetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("{}", { headers: { "Content-Type": "application/vnd.flow-trace+json" } }));

  await expect(loadFlowTrace({ url: "/flow-traces/malformed.json", fetcher: malformedJsonFetcher })).rejects.toMatchObject(
    { failure: "INVALID_JSON" },
  );
  await expect(loadFlowTrace({ url: "/flow-traces/invalid.json", fetcher: invalidTraceFetcher })).rejects.toMatchObject({
    failure: "INVALID_TRACE",
  });
});
