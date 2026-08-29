import { createHash } from "node:crypto";

import type { ReceiveInboundDeliveryCommand } from "../../application/deliveries/receive-inbound-delivery-command.js";
import type { MappedMarketplaceAOrderWebhook } from "./webhook-payload-mapper.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function createMarketplaceAInboundDeliveryCommand(
    rawBody: Uint8Array,
    mappedWebhook: MappedMarketplaceAOrderWebhook
): ReceiveInboundDeliveryCommand {
    return {
        externalEventId: mappedWebhook.providerEventId,
        providerPayloadHash: createHash("sha256").update(rawBody).digest("hex"),
        providerPayloadJson: UTF8_DECODER.decode(rawBody),
        mappingVersion: mappedWebhook.mappingVersion,
        canonicalOrder: mappedWebhook.canonicalOrder
    };
}
