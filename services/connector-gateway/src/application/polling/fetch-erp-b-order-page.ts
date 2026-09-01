import type { ErpBOrderPagePayload } from "../../connectors/erp-b/order-page-parser.js";

export interface FetchErpBOrderPageCommand {
    readonly cursor: string | null;
    readonly signal?: AbortSignal;
}

export type FetchErpBOrderPageResult =
    | {
          readonly outcome: "PAGE_RECEIVED";
          readonly page: ErpBOrderPagePayload;
      }
    | {
          readonly errorCode: "ERP_B_AUTHENTICATION_REJECTED";
          readonly httpStatus: 401 | 403;
          readonly outcome: "BLOCKED_CONFIGURATION";
      }
    | {
          readonly errorCode:
              | "ERP_B_NETWORK_ERROR"
              | "ERP_B_REQUEST_ABORTED"
              | "ERP_B_RETRYABLE_STATUS"
              | "ERP_B_TIMEOUT";
          readonly httpStatus?: number;
          readonly outcome: "RETRYABLE_FAILURE";
          readonly retryAfterMilliseconds?: number;
      }
    | {
          readonly errorCode:
              | "ERP_B_INVALID_CONTENT_TYPE"
              | "ERP_B_INVALID_RESPONSE"
              | "ERP_B_RESPONSE_TOO_LARGE"
              | "ERP_B_UNEXPECTED_STATUS";
          readonly httpStatus: number;
          readonly outcome: "PROTOCOL_FAILURE";
      };

export interface ErpBOrderPageSource {
    fetchPage(command: FetchErpBOrderPageCommand): Promise<FetchErpBOrderPageResult>;
}
