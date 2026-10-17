export const orderStatusLabelKeys = {
  RECEIVED: "orders.status.received",
  PROCESSING: "orders.status.processing",
  READY: "orders.status.ready",
} as const;

export function formatDateTime(value: string, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatMoney(amount: string, currency: string, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number(amount));
}

export function formatQuantity(quantity: string, locale = "en-GB"): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(quantity);
  if (match === null) return quantity;

  const [, sign, integer, rawFraction] = match;
  const integerPart = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(BigInt(integer));
  const fraction = rawFraction?.replace(/0+$/, "");
  if (fraction === undefined || fraction.length === 0) return `${sign}${integerPart}`;

  const decimalSeparator = new Intl.NumberFormat(locale).formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value ?? ".";
  return `${sign}${integerPart}${decimalSeparator}${fraction}`;
}

export function formatDuration(
  startedAt: string,
  completedAt: string | null,
  locale = "en-GB",
  inProgressLabel = "In progress",
): string {
  if (completedAt === null) return inProgressLabel;

  return formatDurationMilliseconds(new Date(completedAt).getTime() - new Date(startedAt).getTime(), locale);
}

export function formatDurationMilliseconds(value: number, locale = "en-GB"): string {
  const durationMilliseconds = Math.max(0, value);
  if (durationMilliseconds < 1_000) return `${durationMilliseconds} ms`;

  const seconds = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(durationMilliseconds / 1_000);
  return `${seconds} s`;
}
