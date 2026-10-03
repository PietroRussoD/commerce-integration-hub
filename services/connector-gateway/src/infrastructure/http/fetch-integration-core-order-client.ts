import type {
    CanonicalOrderForwarder,
    ForwardCanonicalOrderCommand,
    ForwardCanonicalOrderResult
} from "../../application/forwarding/forward-canonical-order.js";
import type { IntegrationCoreClientConfiguration } from "./integration-core-client-configuration.js";
import { parseRetryAfter } from "./retry-after.js";

const MAX_SUCCESS_RESPONSE_BYTES = 65_536;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FetchIntegrationCoreOrderClientDependencies {
    readonly configuration: IntegrationCoreClientConfiguration;
    readonly currentTimeMilliseconds?: () => number;
    readonly fetchImplementation?: typeof fetch;
}

export class FetchIntegrationCoreOrderClient implements CanonicalOrderForwarder {
    private readonly configuration: IntegrationCoreClientConfiguration;
    private readonly currentTimeMilliseconds: () => number;
    private readonly fetchImplementation: typeof fetch;

    public constructor({
        configuration,
        currentTimeMilliseconds = Date.now,
        fetchImplementation = fetch
    }: FetchIntegrationCoreOrderClientDependencies) {
        this.configuration = configuration;
        this.currentTimeMilliseconds = currentTimeMilliseconds;
        this.fetchImplementation = fetchImplementation;
    }

    public async forward(
        command: ForwardCanonicalOrderCommand
    ): Promise<ForwardCanonicalOrderResult> {
        const timeoutSignal = AbortSignal.timeout(this.configuration.timeoutMilliseconds);
        const signal =
            command.signal === undefined
                ? timeoutSignal
                : AbortSignal.any([command.signal, timeoutSignal]);

        let response: Response;
        try {
            response = await this.fetchImplementation(
                `${this.configuration.baseUrl}/api/v1/orders`,
                {
                    body: JSON.stringify(command.canonicalOrder),
                    headers: this.createHeaders(command.correlationId, command.traceContext),
                    method: "POST",
                    redirect: "manual",
                    signal
                }
            );
        } catch {
            if (timeoutSignal.aborted) {
                return { errorCode: "CORE_TIMEOUT", outcome: "RETRYABLE_FAILURE" };
            }
            if (command.signal?.aborted === true) {
                return { errorCode: "CORE_REQUEST_ABORTED", outcome: "RETRYABLE_FAILURE" };
            }
            return { errorCode: "CORE_NETWORK_ERROR", outcome: "RETRYABLE_FAILURE" };
        }

        if (response.status === 200 || response.status === 201) {
            const coreOrderId = await readCoreOrderId(response);
            return coreOrderId === undefined
                ? {
                      errorCode: "CORE_INVALID_RESPONSE",
                      httpStatus: response.status,
                      outcome: "RETRYABLE_FAILURE"
                  }
                : {
                      coreOrderId,
                      equivalentReplay: response.status === 200,
                      httpStatus: response.status,
                      outcome: "DELIVERED"
                  };
        }

        await response.body?.cancel();

        if (response.status === 401 || response.status === 403) {
            return {
                errorCode: "CORE_AUTHENTICATION_REJECTED",
                httpStatus: response.status,
                outcome: "BLOCKED_CONFIGURATION"
            };
        }
        if (
            response.status === 400 ||
            response.status === 404 ||
            response.status === 409 ||
            response.status === 422
        ) {
            return {
                errorCode: "CORE_REQUEST_REJECTED",
                httpStatus: response.status,
                outcome: "PERMANENT_FAILURE"
            };
        }
        if (
            response.status === 408 ||
            response.status === 425 ||
            response.status === 429 ||
            response.status >= 500
        ) {
            const retryAfterMilliseconds = parseRetryAfter(
                response.headers.get("retry-after"),
                this.currentTimeMilliseconds(),
                this.configuration.retryAfterCapMilliseconds
            );
            return retryAfterMilliseconds === undefined
                ? {
                      errorCode: "CORE_RETRYABLE_STATUS",
                      httpStatus: response.status,
                      outcome: "RETRYABLE_FAILURE"
                  }
                : {
                      errorCode: "CORE_RETRYABLE_STATUS",
                      httpStatus: response.status,
                      outcome: "RETRYABLE_FAILURE",
                      retryAfterMilliseconds
                  };
        }
        return {
            errorCode: "CORE_UNEXPECTED_STATUS",
            httpStatus: response.status,
            outcome: "RETRYABLE_FAILURE"
        };
    }

    private createHeaders(
        correlationId: string | undefined,
        traceContext: ForwardCanonicalOrderCommand["traceContext"]
    ): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Source-API-Key": this.configuration.sourceApiKey
        };
        if (correlationId !== undefined) {
            headers["X-Correlation-ID"] = correlationId;
        }
        if (traceContext !== undefined) {
            headers.traceparent = traceContext.traceparent;
            if (traceContext.tracestate !== undefined) {
                headers.tracestate = traceContext.tracestate;
            }
        }
        return headers;
    }
}

async function readCoreOrderId(response: Response): Promise<string | undefined> {
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        await response.body?.cancel();
        return undefined;
    }

    const responseText = await response.text();
    if (Buffer.byteLength(responseText, "utf8") > MAX_SUCCESS_RESPONSE_BYTES) {
        return undefined;
    }

    let body: unknown;
    try {
        body = JSON.parse(responseText) as unknown;
    } catch {
        return undefined;
    }
    if (!isRecord(body) || typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) {
        return undefined;
    }
    return body.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
