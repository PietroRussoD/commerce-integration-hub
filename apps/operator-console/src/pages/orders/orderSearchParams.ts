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
