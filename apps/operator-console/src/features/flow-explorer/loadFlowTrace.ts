import { parseFlowTrace, type FlowTrace } from "./flowTrace";

export type FlowTraceLoadFailure =
  | "NETWORK"
  | "HTTP"
  | "UNEXPECTED_CONTENT_TYPE"
  | "INVALID_JSON"
  | "INVALID_TRACE";

export class FlowTraceLoadError extends Error {
  constructor(
    readonly failure: FlowTraceLoadFailure,
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FlowTraceLoadError";
  }
}

export interface LoadFlowTraceParameters {
  url: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

export async function loadFlowTrace({ url, signal, fetcher = fetch }: LoadFlowTraceParameters): Promise<FlowTrace> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new FlowTraceLoadError("NETWORK", "Flow trace could not be loaded", undefined, { cause });
  }

  if (!response.ok) {
    throw new FlowTraceLoadError("HTTP", `Flow trace request failed with status ${response.status}`, response.status);
  }

  const contentType = response.headers.get("Content-Type");
  if (contentType === null || !/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    throw new FlowTraceLoadError("UNEXPECTED_CONTENT_TYPE", "Flow trace response is not JSON");
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch (cause) {
    throw new FlowTraceLoadError("INVALID_JSON", "Flow trace response contains invalid JSON", undefined, { cause });
  }

  try {
    return parseFlowTrace(value);
  } catch (cause) {
    throw new FlowTraceLoadError("INVALID_TRACE", "Flow trace does not match the supported contract", undefined, {
      cause,
    });
  }
}
