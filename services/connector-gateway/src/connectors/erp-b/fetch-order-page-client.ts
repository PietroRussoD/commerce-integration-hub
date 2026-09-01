import type {
    ErpBOrderPageSource,
    FetchErpBOrderPageCommand,
    FetchErpBOrderPageResult
} from "../../application/polling/fetch-erp-b-order-page.js";
import { parseRetryAfter } from "../../infrastructure/http/retry-after.js";
import type { ErpBClientConfiguration } from "./client-configuration.js";
import { parseErpBOrderPage } from "./order-page-parser.js";

export interface FetchErpBOrderPageClientDependencies {
    readonly configuration: ErpBClientConfiguration;
    readonly currentTimeMilliseconds?: () => number;
    readonly fetchImplementation?: typeof fetch;
}

export class FetchErpBOrderPageClient implements ErpBOrderPageSource {
    private readonly configuration: ErpBClientConfiguration;
    private readonly currentTimeMilliseconds: () => number;
    private readonly fetchImplementation: typeof fetch;

    public constructor({
        configuration,
        currentTimeMilliseconds = Date.now,
        fetchImplementation = fetch
    }: FetchErpBOrderPageClientDependencies) {
        this.configuration = configuration;
        this.currentTimeMilliseconds = currentTimeMilliseconds;
        this.fetchImplementation = fetchImplementation;
    }

    public async fetchPage(
        command: FetchErpBOrderPageCommand
    ): Promise<FetchErpBOrderPageResult> {
        const timeoutSignal = AbortSignal.timeout(this.configuration.timeoutMilliseconds);
        const signal =
            command.signal === undefined
                ? timeoutSignal
                : AbortSignal.any([command.signal, timeoutSignal]);

        let response: Response;
        try {
            response = await this.fetchImplementation(this.createUrl(command.cursor), {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${this.configuration.apiToken}`
                },
                method: "GET",
                redirect: "manual",
                signal
            });
        } catch {
            return classifyTransportFailure(command.signal, timeoutSignal);
        }

        if (response.status === 200) {
            try {
                return await this.parseSuccessfulResponse(response);
            } catch {
                return classifyTransportFailure(command.signal, timeoutSignal);
            }
        }

        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) {
            return {
                errorCode: "ERP_B_AUTHENTICATION_REJECTED",
                httpStatus: response.status,
                outcome: "BLOCKED_CONFIGURATION"
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
                      errorCode: "ERP_B_RETRYABLE_STATUS",
                      httpStatus: response.status,
                      outcome: "RETRYABLE_FAILURE"
                  }
                : {
                      errorCode: "ERP_B_RETRYABLE_STATUS",
                      httpStatus: response.status,
                      outcome: "RETRYABLE_FAILURE",
                      retryAfterMilliseconds
                  };
        }
        return {
            errorCode: "ERP_B_UNEXPECTED_STATUS",
            httpStatus: response.status,
            outcome: "PROTOCOL_FAILURE"
        };
    }

    private createUrl(cursor: string | null): URL {
        const url = new URL("/erp-b/v1/orders", this.configuration.baseUrl);
        url.searchParams.set("limit", String(this.configuration.pageLimit));
        if (cursor !== null) {
            url.searchParams.set("cursor", cursor);
        }
        return url;
    }

    private async parseSuccessfulResponse(response: Response): Promise<FetchErpBOrderPageResult> {
        if (!isJsonContentType(response.headers.get("content-type"))) {
            await response.body?.cancel();
            return {
                errorCode: "ERP_B_INVALID_CONTENT_TYPE",
                httpStatus: response.status,
                outcome: "PROTOCOL_FAILURE"
            };
        }

        const responseBody = await readBoundedBody(
            response,
            this.configuration.maxResponseBytes
        );
        if (responseBody === null) {
            return {
                errorCode: "ERP_B_RESPONSE_TOO_LARGE",
                httpStatus: response.status,
                outcome: "PROTOCOL_FAILURE"
            };
        }

        const parsed = parseErpBOrderPage(responseBody);
        return parsed.valid
            ? { outcome: "PAGE_RECEIVED", page: parsed.page }
            : {
                  errorCode: "ERP_B_INVALID_RESPONSE",
                  httpStatus: response.status,
                  outcome: "PROTOCOL_FAILURE"
              };
    }
}

function isJsonContentType(value: string | null): boolean {
    return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function classifyTransportFailure(
    callerSignal: AbortSignal | undefined,
    timeoutSignal: AbortSignal
): FetchErpBOrderPageResult {
    if (timeoutSignal.aborted) {
        return { errorCode: "ERP_B_TIMEOUT", outcome: "RETRYABLE_FAILURE" };
    }
    if (callerSignal?.aborted === true) {
        return { errorCode: "ERP_B_REQUEST_ABORTED", outcome: "RETRYABLE_FAILURE" };
    }
    return { errorCode: "ERP_B_NETWORK_ERROR", outcome: "RETRYABLE_FAILURE" };
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Uint8Array | null> {
    if (response.body === null) {
        return new Uint8Array();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = (await reader.read()) as {
            readonly done: boolean;
            readonly value: Uint8Array;
        };
        if (done) {
            break;
        }
        totalBytes += value.byteLength;
        if (totalBytes > maximumBytes) {
            await reader.cancel().catch(() => undefined);
            return null;
        }
        chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}
