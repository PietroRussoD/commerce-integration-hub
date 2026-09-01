import { createHash } from "node:crypto";

import type { ReceiveInboundDeliveryCommand } from "../../application/deliveries/receive-inbound-delivery-command.js";
import type { MappedErpBOrderChange } from "./order-page-mapper.js";
import type { ErpBOrderChangePayload } from "./order-page-parser.js";

export const ERP_B_PROVIDER_ITEM_CANONICALIZATION_VERSION = "erp-b-provider-item-v1";

export interface ErpBProviderItemEvidence {
    readonly externalEventId: string;
    readonly providerPayloadHash: string;
    readonly providerPayloadJson: string;
}

export function createErpBProviderItemEvidence(
    change: ErpBOrderChangePayload
): ErpBProviderItemEvidence {
    const providerPayloadJson = JSON.stringify({
        canonicalizationVersion: ERP_B_PROVIDER_ITEM_CANONICALIZATION_VERSION,
        changeId: change.changeId,
        orderCode: change.orderCode,
        currencyCode: change.currencyCode,
        declaredTotal: change.declaredTotal,
        positions: change.positions.map((position) => ({
            positionId: position.positionId,
            articleNumber: position.articleNumber,
            units: position.units,
            pricePerUnit: position.pricePerUnit
        }))
    });

    return {
        externalEventId: change.changeId,
        providerPayloadHash: createHash("sha256").update(providerPayloadJson).digest("hex"),
        providerPayloadJson
    };
}

export function createErpBInboundDeliveryCommand(
    evidence: ErpBProviderItemEvidence,
    mappedChange: MappedErpBOrderChange
): ReceiveInboundDeliveryCommand {
    if (evidence.externalEventId !== mappedChange.providerEventId) {
        throw new Error("ERP_B change identity does not match its canonical mapping");
    }

    return {
        ...evidence,
        mappingVersion: mappedChange.mappingVersion,
        canonicalOrder: mappedChange.canonicalOrder
    };
}
