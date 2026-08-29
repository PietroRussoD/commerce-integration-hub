import type { CanonicalOrder } from "../orders/canonical-order.js";

export interface ReceiveInboundDeliveryCommand {
    readonly externalEventId: string;
    readonly providerPayloadHash: string;
    readonly providerPayloadJson: string;
    readonly mappingVersion: string;
    readonly canonicalOrder: CanonicalOrder;
}
