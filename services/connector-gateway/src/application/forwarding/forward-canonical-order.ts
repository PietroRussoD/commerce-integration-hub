import type { CanonicalOrder } from "../orders/canonical-order.js";

export interface ForwardCanonicalOrderCommand {
    readonly canonicalOrder: CanonicalOrder;
    readonly correlationId?: string;
    readonly signal?: AbortSignal;
}

export type ForwardCanonicalOrderResult =
    | {
          readonly coreOrderId: string;
          readonly equivalentReplay: boolean;
          readonly httpStatus: 200 | 201;
          readonly outcome: "DELIVERED";
      }
    | {
          readonly errorCode: "CORE_AUTHENTICATION_REJECTED";
          readonly httpStatus: 401 | 403;
          readonly outcome: "BLOCKED_CONFIGURATION";
      }
    | {
          readonly errorCode: "CORE_REQUEST_REJECTED";
          readonly httpStatus: 400 | 404 | 409 | 422;
          readonly outcome: "PERMANENT_FAILURE";
      }
    | {
          readonly errorCode:
              | "CORE_INVALID_RESPONSE"
              | "CORE_NETWORK_ERROR"
              | "CORE_REQUEST_ABORTED"
              | "CORE_RETRYABLE_STATUS"
              | "CORE_TIMEOUT"
              | "CORE_UNEXPECTED_STATUS";
          readonly httpStatus?: number;
          readonly outcome: "RETRYABLE_FAILURE";
          readonly retryAfterMilliseconds?: number;
      };

export interface CanonicalOrderForwarder {
    forward(command: ForwardCanonicalOrderCommand): Promise<ForwardCanonicalOrderResult>;
}
