export type CanonicalCurrency = "EUR" | "GBP" | "USD";

export interface CanonicalOrderItem {
    externalLineId: string;
    sku: string;
    quantity: string;
    unitPrice: string;
}

export interface CanonicalOrder {
    externalId: string;
    currency: CanonicalCurrency;
    declaredTotalAmount: string;
    items: CanonicalOrderItem[];
}
