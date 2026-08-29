import type { CanonicalCurrency, CanonicalOrder } from "../../application/orders/canonical-order.js";
import type { MarketplaceAWebhookPayload } from "./webhook-payload-parser.js";

export const MARKETPLACE_A_ORDER_MAPPING_VERSION = "marketplace-a-order-v1";

export interface MappedMarketplaceAOrderWebhook {
    providerEventId: string;
    mappingVersion: typeof MARKETPLACE_A_ORDER_MAPPING_VERSION;
    canonicalOrder: CanonicalOrder;
}

export type MarketplaceAWebhookPayloadMappingResult =
    | { mapped: true; value: MappedMarketplaceAOrderWebhook }
    | {
          mapped: false;
          reason:
              | "unsupported_event_type"
              | "unsupported_currency"
              | "duplicate_line_number"
              | "total_mismatch";
      };

export function mapMarketplaceAWebhookPayload(
    payload: MarketplaceAWebhookPayload
): MarketplaceAWebhookPayloadMappingResult {
    if (payload.eventType !== "order.created") {
        return { mapped: false, reason: "unsupported_event_type" };
    }
    if (!isCanonicalCurrency(payload.order.currency)) {
        return { mapped: false, reason: "unsupported_currency" };
    }

    const lineNumbers = payload.order.lines.map((line) => line.lineNumber);
    if (new Set(lineNumbers).size !== lineNumbers.length) {
        return { mapped: false, reason: "duplicate_line_number" };
    }

    const calculatedTotalCents = payload.order.lines.reduce(
        (total, line) => total + BigInt(line.quantity) * BigInt(line.unitPriceCents),
        0n
    );
    if (calculatedTotalCents !== BigInt(payload.order.totalCents)) {
        return { mapped: false, reason: "total_mismatch" };
    }

    return {
        mapped: true,
        value: {
            providerEventId: payload.eventId,
            mappingVersion: MARKETPLACE_A_ORDER_MAPPING_VERSION,
            canonicalOrder: {
                externalId: payload.order.orderNumber,
                currency: payload.order.currency,
                declaredTotalAmount: formatCents(payload.order.totalCents),
                items: payload.order.lines.map((line) => ({
                    externalLineId: line.lineNumber,
                    sku: line.productCode,
                    quantity: String(line.quantity),
                    unitPrice: formatCents(line.unitPriceCents)
                }))
            }
        }
    };
}

function isCanonicalCurrency(currency: string): currency is CanonicalCurrency {
    return currency === "EUR" || currency === "GBP" || currency === "USD";
}

function formatCents(cents: number): string {
    const value = BigInt(cents);
    const integerPart = value / 100n;
    const fractionalPart = String(value % 100n).padStart(2, "0");
    return `${integerPart}.${fractionalPart}`;
}
