import type { CanonicalOrder } from "../orders/canonical-order.js";
import type { TraceContext } from "../observability/trace-context.js";

export interface ReceiveInboundDeliveryCommand {
    readonly externalEventId: string;
    readonly providerPayloadHash: string;
    readonly providerPayloadJson: string;
    readonly mappingVersion: string;
    readonly traceContext?: TraceContext;
    readonly canonicalOrder: CanonicalOrder;
}
