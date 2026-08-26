const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(amount));
}

export function formatTransition(fromStatus: string | null, toStatus: string | null): string | undefined {
  if (fromStatus !== null && toStatus !== null) {
    return `${formatLabel(fromStatus)} to ${formatLabel(toStatus)}`;
  }
  if (toStatus !== null) {
    return `Entered ${formatLabel(toStatus)}`;
  }
  if (fromStatus !== null) {
    return `Left ${formatLabel(fromStatus)}`;
  }
  return undefined;
}

export function formatDuration(startedAt: string, completedAt: string | null): string {
  if (completedAt === null) return "In progress";

  const durationMilliseconds = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
  if (durationMilliseconds < 1_000) return `${durationMilliseconds} ms`;

  return `${(durationMilliseconds / 1_000).toFixed(1)} s`;
}
