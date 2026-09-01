export function parseRetryAfter(
    value: string | null,
    currentTimeMilliseconds: number,
    capMilliseconds: number
): number | undefined {
    if (value === null) {
        return undefined;
    }

    const trimmed = value.trim();
    if (/^(0|[1-9][0-9]*)$/.test(trimmed)) {
        const milliseconds = Number(trimmed) * 1_000;
        return Number.isSafeInteger(milliseconds)
            ? Math.min(milliseconds, capMilliseconds)
            : undefined;
    }

    const retryAtMilliseconds = Date.parse(trimmed);
    if (!Number.isFinite(retryAtMilliseconds)) {
        return undefined;
    }
    return Math.min(
        Math.max(0, retryAtMilliseconds - currentTimeMilliseconds),
        capMilliseconds
    );
}
