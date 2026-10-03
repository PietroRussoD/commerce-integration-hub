const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

export function jaegerTraceUrl(
  traceId: string | null,
  baseUrl: string | undefined = import.meta.env.VITE_JAEGER_UI_URL,
): string | null {
  if (traceId === null || !TRACE_ID_PATTERN.test(traceId) || baseUrl === undefined || baseUrl.trim() === "") {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "") {
      return null;
    }

    url.pathname = `${url.pathname.replace(/\/+$/, "")}/trace/${traceId}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
