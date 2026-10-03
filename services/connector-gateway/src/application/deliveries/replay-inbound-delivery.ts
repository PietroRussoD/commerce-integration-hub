import { randomUUID } from "node:crypto";

import {
    assertOperatorCommandText,
    assertOperatorCommandUuid,
    type OperatorCommandAction
} from "../operator-commands/operator-command-audit.js";
import type { TraceContext } from "../observability/trace-context.js";

export type ReplayInboundDeliveryRejectionCode =
    | "CONNECTOR_NOT_ACTIVE"
    | "DELIVERY_NOT_FOUND"
    | "DELIVERY_NOT_REPLAYABLE"
    | "DELIVERY_PAYLOAD_EXPIRED";

export interface ReplayInboundDeliveryRequest {
    readonly actorSubject: string;
    readonly deliveryId: string;
    readonly idempotencyKey: string;
    readonly reason: string;
    readonly traceContext?: TraceContext;
}

export interface ReplayInboundDeliveryCommand extends ReplayInboundDeliveryRequest {
    readonly action: OperatorCommandAction;
    readonly commandId: string;
    readonly replayedAt: Date;
}

export type ReplayInboundDeliveryResult =
    | { readonly commandId: string; readonly outcome: "REPLAYED" }
    | {
          readonly commandId: string;
          readonly idempotent: true;
          readonly outcome: "REPLAYED";
      }
    | {
          readonly commandId: string;
          readonly outcome: "REJECTED";
          readonly rejectionCode: ReplayInboundDeliveryRejectionCode;
      }
    | {
          readonly commandId: string;
          readonly idempotent: true;
          readonly outcome: "REJECTED";
          readonly rejectionCode: ReplayInboundDeliveryRejectionCode;
      }
    | { readonly commandId: string; readonly outcome: "IDEMPOTENCY_CONFLICT" }
    | { readonly commandId: string; readonly outcome: "IN_PROGRESS" };

export interface ReplayInboundDeliveryRepository {
    replay(command: ReplayInboundDeliveryCommand): Promise<ReplayInboundDeliveryResult>;
}

export interface ReplayInboundDeliveryDependencies {
    readonly createCommandId?: () => string;
    readonly currentTimeMilliseconds?: () => number;
    readonly repository: ReplayInboundDeliveryRepository;
}

export type ReplayInboundDeliveryUseCase = (
    request: ReplayInboundDeliveryRequest
) => Promise<ReplayInboundDeliveryResult>;

export function createReplayInboundDeliveryUseCase({
    createCommandId = randomUUID,
    currentTimeMilliseconds = Date.now,
    repository
}: ReplayInboundDeliveryDependencies): ReplayInboundDeliveryUseCase {
    return (request) => {
        assertOperatorCommandText(request.actorSubject, "actorSubject", 200);
        assertOperatorCommandUuid(request.deliveryId, "deliveryId");
        assertOperatorCommandUuid(request.idempotencyKey, "idempotencyKey");
        assertOperatorCommandText(request.reason, "reason", 1_000);
        const commandId = createCommandId();
        assertOperatorCommandUuid(commandId, "generated commandId");
        return repository.replay({
            ...request,
            action: "DELIVERY_REPLAY",
            commandId,
            replayedAt: new Date(currentTimeMilliseconds())
        });
    };
}
