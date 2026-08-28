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

export function formatDuration(
  startedAt: string,
  completedAt: string | null,
  locale = "en-GB",
  inProgressLabel = "In progress",
): string {
  if (completedAt === null) return inProgressLabel;

  const durationMilliseconds = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
  if (durationMilliseconds < 1_000) return `${durationMilliseconds} ms`;

  const seconds = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(durationMilliseconds / 1_000);
  return `${seconds} s`;
}
