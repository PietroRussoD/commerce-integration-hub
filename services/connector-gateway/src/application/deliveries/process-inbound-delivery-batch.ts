import type {
    ClaimInboundDeliveriesUseCase,
    ClaimedInboundDelivery
} from "./claim-inbound-deliveries.js";
import type { CompleteDeliveredInboundDeliveryAttemptUseCase } from "./complete-delivered-inbound-delivery-attempt.js";
import type {
    CompleteRetryableInboundDeliveryAttemptRequest,
    CompleteRetryableInboundDeliveryAttemptResult
} from "./complete-retryable-inbound-delivery-attempt.js";
import type {
    CompleteTerminalInboundDeliveryAttemptRequest,
    CompleteTerminalInboundDeliveryAttemptResult
} from "./complete-terminal-inbound-delivery-attempt.js";
import type { StartInboundDeliveryAttemptUseCase } from "./start-inbound-delivery-attempt.js";
import type {
    CanonicalOrderForwarder,
    ForwardCanonicalOrderResult
} from "../forwarding/forward-canonical-order.js";
import type { ActiveDeliveryTrace, DeliveryTraceRunner } from "../observability/trace-context.js";

type CompleteRetryableInboundDeliveryAttemptUseCase = (
    request: CompleteRetryableInboundDeliveryAttemptRequest
) => Promise<CompleteRetryableInboundDeliveryAttemptResult>;

type CompleteTerminalInboundDeliveryAttemptUseCase = (
    request: CompleteTerminalInboundDeliveryAttemptRequest
) => Promise<CompleteTerminalInboundDeliveryAttemptResult>;

export interface ProcessInboundDeliveryBatchDependencies {
    readonly claimInboundDeliveries: ClaimInboundDeliveriesUseCase;
    readonly completeDelivered: CompleteDeliveredInboundDeliveryAttemptUseCase;
    readonly completeRetryable: CompleteRetryableInboundDeliveryAttemptUseCase;
    readonly completeTerminal: CompleteTerminalInboundDeliveryAttemptUseCase;
    readonly forwarder: CanonicalOrderForwarder;
    readonly runWithDeliveryTraceContext: DeliveryTraceRunner;
    readonly startAttempt: StartInboundDeliveryAttemptUseCase;
}

export interface ProcessInboundDeliveryBatchRequest {
    readonly signal?: AbortSignal;
}

export interface ProcessInboundDeliveryBatchResult {
    readonly blockedConfigurations: number;
    readonly claimed: number;
    readonly delivered: number;
    readonly permanentFailures: number;
    readonly retryableFailures: number;
    readonly staleClaims: number;
}

type DeliveryProcessingOutcome =
    | ForwardCanonicalOrderResult["outcome"]
    | "STALE_CLAIM";

export function createProcessInboundDeliveryBatchUseCase({
    claimInboundDeliveries,
    completeDelivered,
    completeRetryable,
    completeTerminal,
    forwarder,
    runWithDeliveryTraceContext,
    startAttempt
}: ProcessInboundDeliveryBatchDependencies) {
    return async ({
        signal
    }: ProcessInboundDeliveryBatchRequest = {}): Promise<ProcessInboundDeliveryBatchResult> => {
        const claimedDeliveries = await claimInboundDeliveries();
        const outcomes = await Promise.all(
            claimedDeliveries.map(async (delivery): Promise<DeliveryProcessingOutcome> => {
                return runWithDeliveryTraceContext(
                    delivery.traceContext,
                    delivery.replayLinkContext,
                    async (activeTrace) =>
                        processClaimedDelivery(delivery, activeTrace, {
                            completeDelivered,
                            completeRetryable,
                            completeTerminal,
                            forwarder,
                            signal,
                            startAttempt
                        })
                );
            })
        );

        return summarize(outcomes);
    };
}

interface ProcessClaimedDeliveryDependencies extends CompletionDependencies {
    readonly forwarder: CanonicalOrderForwarder;
    readonly signal: AbortSignal | undefined;
    readonly startAttempt: StartInboundDeliveryAttemptUseCase;
}

async function processClaimedDelivery(
    delivery: ClaimedInboundDelivery,
    activeTrace: ActiveDeliveryTrace | undefined,
    dependencies: ProcessClaimedDeliveryDependencies
): Promise<DeliveryProcessingOutcome> {
    const attempt = await dependencies.startAttempt({
        deliveryId: delivery.deliveryId,
        leaseToken: delivery.leaseToken,
        ...(activeTrace === undefined
            ? {}
            : { traceId: activeTrace.traceId, traceContext: activeTrace.context })
    });
    if (attempt.outcome === "STALE_CLAIM") {
        return "STALE_CLAIM";
    }

    const forwardingResult = await dependencies.forwarder.forward({
        canonicalOrder: delivery.canonicalOrder,
        ...(activeTrace === undefined ? {} : { traceContext: activeTrace.context }),
        ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal })
    });
    const completion = await completeAttempt(
        delivery.deliveryId,
        delivery.leaseToken,
        attempt,
        forwardingResult,
        dependencies
    );
    return completion.outcome === "STALE_CLAIM" ? "STALE_CLAIM" : forwardingResult.outcome;
}

interface CompletionDependencies {
    readonly completeDelivered: CompleteDeliveredInboundDeliveryAttemptUseCase;
    readonly completeRetryable: CompleteRetryableInboundDeliveryAttemptUseCase;
    readonly completeTerminal: CompleteTerminalInboundDeliveryAttemptUseCase;
}

interface StartedAttempt {
    readonly attemptId: string;
    readonly attemptNumber: number;
    readonly deliveryReceivedAt: Date;
}

function completeAttempt(
    deliveryId: string,
    leaseToken: string,
    attempt: StartedAttempt,
    result: ForwardCanonicalOrderResult,
    dependencies: CompletionDependencies
): Promise<{ readonly outcome: "COMPLETED" | "STALE_CLAIM" }> {
    const attemptIdentity = {
        attemptId: attempt.attemptId,
        deliveryId,
        leaseToken
    };

    switch (result.outcome) {
        case "DELIVERED":
            return dependencies.completeDelivered({
                ...attemptIdentity,
                coreOrderId: result.coreOrderId,
                httpStatus: result.httpStatus
            });
        case "RETRYABLE_FAILURE":
            return dependencies.completeRetryable({
                ...attemptIdentity,
                attemptNumber: attempt.attemptNumber,
                deliveryReceivedAt: attempt.deliveryReceivedAt,
                errorCode: result.errorCode,
                ...(result.httpStatus === undefined ? {} : { httpStatus: result.httpStatus }),
                ...(result.retryAfterMilliseconds === undefined
                    ? {}
                    : { retryAfterMilliseconds: result.retryAfterMilliseconds })
            });
        case "BLOCKED_CONFIGURATION":
        case "PERMANENT_FAILURE":
            return dependencies.completeTerminal({
                ...attemptIdentity,
                attemptNumber: attempt.attemptNumber,
                ...result
            });
    }
}

function summarize(
    outcomes: readonly DeliveryProcessingOutcome[]
): ProcessInboundDeliveryBatchResult {
    return {
        blockedConfigurations: count(outcomes, "BLOCKED_CONFIGURATION"),
        claimed: outcomes.length,
        delivered: count(outcomes, "DELIVERED"),
        permanentFailures: count(outcomes, "PERMANENT_FAILURE"),
        retryableFailures: count(outcomes, "RETRYABLE_FAILURE"),
        staleClaims: count(outcomes, "STALE_CLAIM")
    };
}

function count(
    outcomes: readonly DeliveryProcessingOutcome[],
    expected: DeliveryProcessingOutcome
): number {
    return outcomes.filter((outcome) => outcome === expected).length;
}
