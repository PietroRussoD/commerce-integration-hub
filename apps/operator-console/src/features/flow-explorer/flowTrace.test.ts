import { describe, expect, test } from "vitest";

import { flowTraceSchemaVersion, parseFlowTrace } from "./flowTrace";

const validTrace = {
  schemaVersion: flowTraceSchemaVersion,
  traceId: "erp-b-success-001",
  scenario: { id: "erp-b-success", sourceSystem: "ERP_B", outcome: "SUCCEEDED" },
  capturedAt: "2026-09-03T06:00:00.000Z",
  durationMs: 240,
  correlationId: "trace:erp-b-success-001",
  participants: [
    { id: "erp-b", kind: "EXTERNAL_SYSTEM", label: "ERP_B" },
    { id: "connector-gateway", kind: "SERVICE", label: "Connector Gateway" },
    { id: "gateway-database", kind: "DATABASE", label: "Gateway PostgreSQL" },
  ],
  steps: [
    {
      id: "fetch-page",
      sequence: 1,
      offsetMs: 0,
      phase: "POLLING",
      kind: "INTERACTION",
      eventType: "ERP_PAGE_REQUESTED",
      sourceParticipantId: "connector-gateway",
      targetParticipantId: "erp-b",
      status: "INFORMATIONAL",
      evidence: [
        { name: "HTTP_METHOD", value: "GET" },
        { name: "CURSOR", value: "initial" },
      ],
    },
    {
      id: "commit-page",
      sequence: 2,
      offsetMs: 180,
      phase: "RECEIPT",
      kind: "PERSISTENCE",
      eventType: "ERP_PAGE_COMMITTED",
      sourceParticipantId: "connector-gateway",
      targetParticipantId: "gateway-database",
      status: "SUCCEEDED",
      evidence: [
        { name: "DELIVERY_STATE", value: "RECEIVED" },
        { name: "CHECKPOINT_VERSION", value: "2" },
      ],
    },
    {
      id: "scenario-completed",
      sequence: 3,
      offsetMs: 240,
      phase: "COMPLETION",
      kind: "OUTCOME",
      eventType: "SCENARIO_COMPLETED",
      sourceParticipantId: "connector-gateway",
      status: "SUCCEEDED",
      evidence: [],
    },
  ],
} as const;

test("parses a complete flow trace", () => {
  expect(parseFlowTrace(validTrace)).toEqual(validTrace);
});

describe("flow trace invariants", () => {
  test("rejects unknown fields and unapproved evidence names", () => {
    const traceWithUnsafeEvidence = structuredClone(validTrace) as Record<string, unknown>;
    traceWithUnsafeEvidence.rawPayload = { apiKey: "must-not-be-rendered" };

    expect(() => parseFlowTrace(traceWithUnsafeEvidence)).toThrow();
    expect(() =>
      parseFlowTrace({
        ...validTrace,
        steps: [
          { ...validTrace.steps[0], evidence: [{ name: "AUTHORIZATION", value: "secret" }] },
          ...validTrace.steps.slice(1),
        ],
      }),
    ).toThrow();
  });

  test("rejects a source system outside the v1 ERP_B scenarios", () => {
    expect(() =>
      parseFlowTrace({ ...validTrace, scenario: { ...validTrace.scenario, sourceSystem: "MARKETPLACE_A" } }),
    ).toThrow();
  });

  test("rejects duplicate participant, step, and evidence identifiers", () => {
    expect(() =>
      parseFlowTrace({
        ...validTrace,
        participants: [validTrace.participants[0], validTrace.participants[0]],
        steps: [
          {
            ...validTrace.steps[0],
            evidence: [
              { name: "CURSOR", value: "initial" },
              { name: "CURSOR", value: "duplicate" },
            ],
          },
          { ...validTrace.steps[1], id: validTrace.steps[0].id },
          validTrace.steps[2],
        ],
      }),
    ).toThrow();
  });

  test("rejects missing participants and self-directed interactions", () => {
    expect(() =>
      parseFlowTrace({
        ...validTrace,
        steps: [
          {
            ...validTrace.steps[0],
            sourceParticipantId: "missing-service",
            targetParticipantId: "missing-target",
          },
          validTrace.steps[1],
          validTrace.steps[2],
        ],
      }),
    ).toThrow();

    expect(() =>
      parseFlowTrace({
        ...validTrace,
        steps: [
          { ...validTrace.steps[0], targetParticipantId: validTrace.steps[0].sourceParticipantId },
          validTrace.steps[1],
          validTrace.steps[2],
        ],
      }),
    ).toThrow();
  });

  test("rejects gaps, time regressions, and steps beyond the trace duration", () => {
    expect(() =>
      parseFlowTrace({
        ...validTrace,
        steps: [validTrace.steps[0], { ...validTrace.steps[1], sequence: 3, offsetMs: 300 }, validTrace.steps[2]],
      }),
    ).toThrow();

    expect(() =>
      parseFlowTrace({
        ...validTrace,
        steps: [validTrace.steps[0], validTrace.steps[1], { ...validTrace.steps[2], offsetMs: 100 }],
      }),
    ).toThrow();
  });

  test.each([
    { outcome: "SUCCEEDED", status: "BLOCKED" },
    { outcome: "COMPLETED_WITH_REJECTIONS", status: "SUCCEEDED" },
    { outcome: "BLOCKED_CONFIGURATION", status: "REJECTED" },
  ] as const)("rejects a $status terminal step for a $outcome scenario", ({ outcome, status }) => {
    expect(() =>
      parseFlowTrace({
        ...validTrace,
        scenario: { ...validTrace.scenario, outcome },
        steps: [validTrace.steps[0], validTrace.steps[1], { ...validTrace.steps[2], status }],
      }),
    ).toThrow();
  });

  test("requires the final step to be a completion outcome", () => {
    expect(() =>
      parseFlowTrace({ ...validTrace, steps: [validTrace.steps[0], validTrace.steps[2], validTrace.steps[1]] }),
    ).toThrow();
  });
});
