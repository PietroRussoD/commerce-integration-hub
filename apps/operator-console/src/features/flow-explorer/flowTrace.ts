import { z } from "zod";

export const flowTraceSchemaVersion = "1.0" as const;
export const flowTraceScenarioIds = [
  "erp-b-success",
  "erp-b-poison-item",
  "erp-b-authentication-rejection",
] as const;

export type FlowTraceScenarioId = (typeof flowTraceScenarioIds)[number];

const identifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const evidenceValueSchema = z.string().trim().min(1).max(120);

const participantSchema = z
  .object({
    id: identifierSchema,
    kind: z.enum(["EXTERNAL_SYSTEM", "SERVICE", "DATABASE", "MESSAGE_BROKER"]),
    label: z.string().trim().min(1).max(80),
  })
  .strict();

const evidenceFactSchema = z
  .object({
    name: z.enum([
      "ATTEMPT_NUMBER",
      "CHECKPOINT_VERSION",
      "CURSOR",
      "DELIVERY_STATE",
      "ERROR_CODE",
      "EVENT_TYPE",
      "HTTP_METHOD",
      "HTTP_STATUS",
      "ITEM_COUNT",
      "NEXT_CURSOR",
      "ORDER_STATUS",
    ]),
    value: evidenceValueSchema,
  })
  .strict();

const stepStatusSchema = z.enum(["INFORMATIONAL", "SUCCEEDED", "REJECTED", "BLOCKED"]);

const flowStepSchema = z
  .object({
    id: identifierSchema,
    sequence: z.number().int().positive(),
    offsetMs: z.number().int().nonnegative(),
    phase: z.enum(["POLLING", "RECEIPT", "FORWARDING", "PROCESSING", "COMPLETION"]),
    kind: z.enum(["INTERACTION", "PERSISTENCE", "STATE_TRANSITION", "MESSAGE", "OUTCOME"]),
    eventType: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
    sourceParticipantId: identifierSchema,
    targetParticipantId: identifierSchema.optional(),
    status: stepStatusSchema,
    evidence: z.array(evidenceFactSchema).max(8),
  })
  .strict()
  .superRefine((step, context) => {
    const factNames = step.evidence.map((fact) => fact.name);
    if (new Set(factNames).size !== factNames.length) {
      context.addIssue({ code: "custom", message: "Evidence fact names must be unique", path: ["evidence"] });
    }

    if (step.targetParticipantId === step.sourceParticipantId) {
      context.addIssue({
        code: "custom",
        message: "Source and target participants must differ",
        path: ["targetParticipantId"],
      });
    }
  });

const scenarioOutcomeSchema = z.enum(["SUCCEEDED", "COMPLETED_WITH_REJECTIONS", "BLOCKED_CONFIGURATION"]);

const expectedTerminalStatus = {
  SUCCEEDED: "SUCCEEDED",
  COMPLETED_WITH_REJECTIONS: "REJECTED",
  BLOCKED_CONFIGURATION: "BLOCKED",
} as const satisfies Record<z.infer<typeof scenarioOutcomeSchema>, z.infer<typeof stepStatusSchema>>;

export const flowTraceSchema = z
  .object({
    schemaVersion: z.literal(flowTraceSchemaVersion),
    traceId: identifierSchema,
    scenario: z
      .object({
        id: z.enum(flowTraceScenarioIds),
        sourceSystem: z.literal("ERP_B"),
        outcome: scenarioOutcomeSchema,
      })
      .strict(),
    capturedAt: z.iso.datetime({ offset: true }),
    durationMs: z.number().int().nonnegative(),
    correlationId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
    participants: z.array(participantSchema).min(2).max(12),
    steps: z.array(flowStepSchema).min(1).max(100),
  })
  .strict()
  .superRefine((trace, context) => {
    const participantIds = trace.participants.map((participant) => participant.id);
    const knownParticipantIds = new Set(participantIds);
    if (knownParticipantIds.size !== participantIds.length) {
      context.addIssue({ code: "custom", message: "Participant IDs must be unique", path: ["participants"] });
    }

    const stepIds = new Set<string>();
    let previousOffsetMs = 0;
    trace.steps.forEach((step, index) => {
      if (stepIds.has(step.id)) {
        context.addIssue({ code: "custom", message: "Step IDs must be unique", path: ["steps", index, "id"] });
      }
      stepIds.add(step.id);

      if (step.sequence !== index + 1) {
        context.addIssue({
          code: "custom",
          message: "Step sequence must be contiguous and start at one",
          path: ["steps", index, "sequence"],
        });
      }
      if (step.offsetMs < previousOffsetMs || step.offsetMs > trace.durationMs) {
        context.addIssue({
          code: "custom",
          message: "Step offsets must be monotonic and within the trace duration",
          path: ["steps", index, "offsetMs"],
        });
      }
      previousOffsetMs = step.offsetMs;

      if (!knownParticipantIds.has(step.sourceParticipantId)) {
        context.addIssue({
          code: "custom",
          message: "Step source must reference a declared participant",
          path: ["steps", index, "sourceParticipantId"],
        });
      }
      if (step.targetParticipantId !== undefined && !knownParticipantIds.has(step.targetParticipantId)) {
        context.addIssue({
          code: "custom",
          message: "Step target must reference a declared participant",
          path: ["steps", index, "targetParticipantId"],
        });
      }
    });

    const terminalStep = trace.steps.at(-1);
    if (
      terminalStep?.kind !== "OUTCOME" ||
      terminalStep.phase !== "COMPLETION" ||
      terminalStep.status !== expectedTerminalStatus[trace.scenario.outcome]
    ) {
      context.addIssue({
        code: "custom",
        message: "The final step must match the scenario outcome",
        path: ["steps", trace.steps.length - 1],
      });
    }
  });

export type FlowTrace = z.infer<typeof flowTraceSchema>;
export type FlowParticipant = FlowTrace["participants"][number];
export type FlowStep = FlowTrace["steps"][number];

export function parseFlowTrace(value: unknown): FlowTrace {
  return flowTraceSchema.parse(value);
}
