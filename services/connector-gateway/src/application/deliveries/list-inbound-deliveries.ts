const MAX_PAGE_SIZE = 100;
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const inboundDeliveryStatuses = [
    "BLOCKED_CONFIGURATION",
    "DELIVERED",
    "EXHAUSTED",
    "FORWARDING",
    "PERMANENT_FAILURE",
    "RECEIVED",
    "RETRY_WAIT"
] as const;

export type InboundDeliveryStatus = (typeof inboundDeliveryStatuses)[number];
export type DeliveryProvider = "ERP_B" | "MARKETPLACE_A";

export interface InboundDeliveryCursor {
    readonly deliveryId: string;
    readonly receivedAt: string;
}

export interface ListInboundDeliveriesQuery {
    readonly cursor?: InboundDeliveryCursor;
    readonly limit: number;
    readonly provider?: DeliveryProvider;
    readonly statuses?: readonly InboundDeliveryStatus[];
}

export interface InboundDeliverySummary {
    readonly attemptCount: number;
    readonly completedAt: Date | null;
    readonly correlationId: string | null;
    readonly deliveryId: string;
    readonly errorCode: string | null;
    readonly externalEventId: string;
    readonly lastCoreOrderId: string | null;
    readonly lastHttpStatus: number | null;
    readonly provider: DeliveryProvider;
    readonly receivedAt: Date;
    readonly sourceSystem: string;
    readonly status: InboundDeliveryStatus;
    readonly updatedAt: Date;
}

export interface InboundDeliveryPage {
    readonly items: readonly InboundDeliverySummary[];
    readonly nextCursor: InboundDeliveryCursor | null;
}

export interface InboundDeliveryInspectionRepository {
    list(query: ListInboundDeliveriesQuery): Promise<InboundDeliveryPage>;
}

export type ListInboundDeliveriesUseCase = (
    query: ListInboundDeliveriesQuery
) => Promise<InboundDeliveryPage>;

export function createListInboundDeliveriesUseCase(
    repository: InboundDeliveryInspectionRepository
): ListInboundDeliveriesUseCase {
    return (query) => {
        validateQuery(query);
        return repository.list(query);
    };
}

function validateQuery(query: ListInboundDeliveriesQuery): void {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_PAGE_SIZE) {
        throw new Error(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
    }
    if (query.statuses !== undefined && query.statuses.length === 0) {
        throw new Error("statuses must contain at least one value when provided");
    }
    if (query.cursor === undefined) {
        return;
    }
    assertInboundDeliveryCursor(query.cursor);
}

export function assertInboundDeliveryCursor(cursor: InboundDeliveryCursor): void {
    if (!UUID_PATTERN.test(cursor.deliveryId)) {
        throw new Error("cursor deliveryId must be a canonical UUID");
    }
    if (!CURSOR_TIMESTAMP_PATTERN.test(cursor.receivedAt)) {
        throw new Error("cursor receivedAt must be a UTC timestamp with microsecond precision");
    }
}
