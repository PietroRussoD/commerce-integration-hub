import type { InboundDeliverySummary } from "./list-inbound-deliveries.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type ConnectorMode = "POLLING" | "WEBHOOK";
export type ConnectorStatus = "ACTIVE" | "BLOCKED_CONFIGURATION" | "DISABLED";
export type DeliveryAttemptOutcome =
    | "BLOCKED_CONFIGURATION"
    | "DELIVERED"
    | "PERMANENT_FAILURE"
    | "RETRYABLE_FAILURE";

export interface InboundDeliveryAttemptSummary {
    readonly attemptId: string;
    readonly attemptNumber: number;
    readonly completedAt: Date | null;
    readonly durationMilliseconds: number | null;
    readonly errorCode: string | null;
    readonly httpStatus: number | null;
    readonly outcome: DeliveryAttemptOutcome | null;
    readonly safeErrorMessage: string | null;
    readonly startedAt: Date;
    readonly traceId: string | null;
}

export interface InboundDeliveryDetail extends InboundDeliverySummary {
    readonly attempts: readonly InboundDeliveryAttemptSummary[];
    readonly connectorId: string;
    readonly connectorMode: ConnectorMode;
    readonly connectorStatus: ConnectorStatus;
    readonly mappingVersion: string;
    readonly nextAttemptAt: Date;
    readonly payloadExpiresAt: Date;
    readonly payloadRetained: boolean;
    readonly safeErrorMessage: string | null;
}

export interface InboundDeliveryDetailRepository {
    findById(deliveryId: string): Promise<InboundDeliveryDetail | null>;
}

export type GetInboundDeliveryUseCase = (
    deliveryId: string
) => Promise<InboundDeliveryDetail | null>;

export function createGetInboundDeliveryUseCase(
    repository: InboundDeliveryDetailRepository
): GetInboundDeliveryUseCase {
    return (deliveryId) => {
        if (!UUID_PATTERN.test(deliveryId)) {
            throw new Error("deliveryId must be a canonical UUID");
        }
        return repository.findById(deliveryId);
    };
}
