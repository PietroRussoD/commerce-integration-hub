export interface OrderSearchCriteria {
  q?: string;
  externalOrderId?: string;
  sku?: string;
}

export function normalizeOrderSearchCriteria(criteria: OrderSearchCriteria): OrderSearchCriteria | undefined {
  const normalized = Object.fromEntries(
    Object.entries(criteria).flatMap(([name, value]) => {
      const text = value?.trim();
      return text ? [[name, text]] : [];
    }),
  );
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

export function readOrderSearchCriteria(params: URLSearchParams): OrderSearchCriteria | undefined {
  return normalizeOrderSearchCriteria({
    q: params.get("q") ?? undefined,
    externalOrderId: params.get("externalOrderId") ?? undefined,
    sku: params.get("sku") ?? undefined,
  });
}

export function parsePageOffset(value: string | null, pageSize: number): number {
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset > 0 && offset % pageSize === 0 ? offset : 0;
}

export function withPageOffset(current: URLSearchParams, name: string, offset: number): URLSearchParams {
  const next = new URLSearchParams(current);
  if (offset === 0) next.delete(name);
  else next.set(name, String(offset));
  return next;
}
