import type { CanonicalCurrency, CanonicalOrder } from "../../application/orders/canonical-order.js";
import type { ErpBOrderChangePayload } from "./order-page-parser.js";

export const ERP_B_ORDER_MAPPING_VERSION = "erp-b-order-v1";

export interface MappedErpBOrderChange {
    readonly providerEventId: string;
    readonly mappingVersion: typeof ERP_B_ORDER_MAPPING_VERSION;
    readonly canonicalOrder: CanonicalOrder;
}

export type ErpBOrderChangeMappingResult =
    | { mapped: true; value: MappedErpBOrderChange }
    | {
          mapped: false;
          reason:
              | "invalid_identifier"
              | "unsupported_currency"
              | "duplicate_position_id"
              | "non_positive_quantity"
              | "total_mismatch";
      };

export function mapErpBOrderChange(
    change: ErpBOrderChangePayload
): ErpBOrderChangeMappingResult {
    if (!hasCanonicalIdentifiers(change)) {
        return { mapped: false, reason: "invalid_identifier" };
    }
    if (!isCanonicalCurrency(change.currencyCode)) {
        return { mapped: false, reason: "unsupported_currency" };
    }

    const positionIds = change.positions.map((position) => position.positionId);
    if (new Set(positionIds).size !== positionIds.length) {
        return { mapped: false, reason: "duplicate_position_id" };
    }
    if (change.positions.some((position) => parseDecimal(position.units).coefficient === 0n)) {
        return { mapped: false, reason: "non_positive_quantity" };
    }

    const calculatedTotalMinorUnits = change.positions.reduce(
        (total, position) =>
            total +
            multiplyAndRoundToMinorUnits(
                parseDecimal(position.units),
                parseDecimal(position.pricePerUnit)
            ),
        0n
    );
    if (calculatedTotalMinorUnits !== toMinorUnits(parseDecimal(change.declaredTotal))) {
        return { mapped: false, reason: "total_mismatch" };
    }

    return {
        mapped: true,
        value: {
            providerEventId: change.changeId,
            mappingVersion: ERP_B_ORDER_MAPPING_VERSION,
            canonicalOrder: {
                externalId: change.orderCode,
                currency: change.currencyCode,
                declaredTotalAmount: formatMinorUnits(calculatedTotalMinorUnits),
                items: change.positions.map((position) => ({
                    externalLineId: position.positionId,
                    sku: position.articleNumber,
                    quantity: normalizeDecimal(position.units),
                    unitPrice: normalizeDecimal(position.pricePerUnit)
                }))
            }
        }
    };
}

interface ParsedDecimal {
    readonly coefficient: bigint;
    readonly scale: number;
}

function hasCanonicalIdentifiers(change: ErpBOrderChangePayload): boolean {
    return (
        isTrimmed(change.orderCode) &&
        change.positions.every(
            (position) => isTrimmed(position.positionId) && isTrimmed(position.articleNumber)
        )
    );
}

function isTrimmed(value: string): boolean {
    return value === value.trim();
}

function isCanonicalCurrency(currency: string): currency is CanonicalCurrency {
    return currency === "EUR" || currency === "GBP" || currency === "USD";
}

function parseDecimal(value: string): ParsedDecimal {
    const [integerPart, fractionalPart = ""] = value.split(".");
    return {
        coefficient: BigInt(`${integerPart}${fractionalPart}`),
        scale: fractionalPart.length
    };
}

function multiplyAndRoundToMinorUnits(left: ParsedDecimal, right: ParsedDecimal): bigint {
    return roundHalfUp(left.coefficient * right.coefficient, left.scale + right.scale, 2);
}

function toMinorUnits(value: ParsedDecimal): bigint {
    return roundHalfUp(value.coefficient, value.scale, 2);
}

function roundHalfUp(coefficient: bigint, sourceScale: number, targetScale: number): bigint {
    if (sourceScale <= targetScale) {
        return coefficient * 10n ** BigInt(targetScale - sourceScale);
    }

    const divisor = 10n ** BigInt(sourceScale - targetScale);
    const quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    return remainder * 2n >= divisor ? quotient + 1n : quotient;
}

function normalizeDecimal(value: string): string {
    if (!value.includes(".")) {
        return value;
    }
    return value.replace(/0+$/, "").replace(/\.$/, "");
}

function formatMinorUnits(minorUnits: bigint): string {
    const integerPart = minorUnits / 100n;
    const fractionalPart = String(minorUnits % 100n).padStart(2, "0");
    return `${integerPart}.${fractionalPart}`;
}
