export type CanonicalCurrency = "EUR" | "GBP" | "USD";

export interface CanonicalOrderItem {
    readonly externalLineId: string;
    readonly sku: string;
    readonly quantity: string;
    readonly unitPrice: string;
}

export interface CanonicalOrder {
    readonly externalId: string;
    readonly currency: CanonicalCurrency;
    readonly declaredTotalAmount: string;
    readonly items: readonly CanonicalOrderItem[];
}
