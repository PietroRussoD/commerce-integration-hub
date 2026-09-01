import type { ReceiveInboundDeliveryCommand } from "../../application/deliveries/receive-inbound-delivery-command.js";
import {
    createErpBInboundDeliveryCommand,
    createErpBProviderItemEvidence
} from "./order-change-receipt-command.js";
import {
    ERP_B_ORDER_MAPPING_VERSION,
    mapErpBOrderChange,
    type ErpBOrderChangeMappingFailureReason
} from "./order-page-mapper.js";
import type { ErpBOrderPagePayload } from "./order-page-parser.js";

export type ErpBMappingErrorCode =
    | "ERP_B_DUPLICATE_POSITION_ID"
    | "ERP_B_INVALID_IDENTIFIER"
    | "ERP_B_NON_POSITIVE_QUANTITY"
    | "ERP_B_TOTAL_MISMATCH"
    | "ERP_B_UNSUPPORTED_CURRENCY";

export interface RejectedErpBOrderChange {
    readonly externalEventId: string;
    readonly providerPayloadHash: string;
    readonly providerPayloadJson: string;
    readonly mappingVersion: typeof ERP_B_ORDER_MAPPING_VERSION;
    readonly errorCode: ErpBMappingErrorCode;
}

export interface ClassifiedErpBOrderPage {
    readonly deliveries: readonly ReceiveInboundDeliveryCommand[];
    readonly rejectedChanges: readonly RejectedErpBOrderChange[];
    readonly nextCursor: string;
    readonly hasMore: boolean;
}

export type ErpBOrderPageClassificationResult =
    | { classified: true; value: ClassifiedErpBOrderPage }
    | {
          classified: false;
          reason: "conflicting_change_id";
          externalEventId: string;
      };

const MAPPING_ERROR_CODES = {
    duplicate_position_id: "ERP_B_DUPLICATE_POSITION_ID",
    invalid_identifier: "ERP_B_INVALID_IDENTIFIER",
    non_positive_quantity: "ERP_B_NON_POSITIVE_QUANTITY",
    total_mismatch: "ERP_B_TOTAL_MISMATCH",
    unsupported_currency: "ERP_B_UNSUPPORTED_CURRENCY"
} as const satisfies Record<ErpBOrderChangeMappingFailureReason, ErpBMappingErrorCode>;

export function classifyErpBOrderPage(
    page: ErpBOrderPagePayload
): ErpBOrderPageClassificationResult {
    const deliveries: ReceiveInboundDeliveryCommand[] = [];
    const rejectedChanges: RejectedErpBOrderChange[] = [];
    const seenHashes = new Map<string, string>();

    for (const change of page.items) {
        const evidence = createErpBProviderItemEvidence(change);
        const existingHash = seenHashes.get(evidence.externalEventId);
        if (existingHash !== undefined) {
            if (existingHash !== evidence.providerPayloadHash) {
                return {
                    classified: false,
                    reason: "conflicting_change_id",
                    externalEventId: evidence.externalEventId
                };
            }
            continue;
        }
        seenHashes.set(evidence.externalEventId, evidence.providerPayloadHash);

        const mapping = mapErpBOrderChange(change);
        if (mapping.mapped) {
            deliveries.push(createErpBInboundDeliveryCommand(evidence, mapping.value));
        } else {
            rejectedChanges.push({
                ...evidence,
                mappingVersion: ERP_B_ORDER_MAPPING_VERSION,
                errorCode: MAPPING_ERROR_CODES[mapping.reason]
            });
        }
    }

    return {
        classified: true,
        value: {
            deliveries,
            rejectedChanges,
            nextCursor: page.nextCursor,
            hasMore: page.hasMore
        }
    };
}
