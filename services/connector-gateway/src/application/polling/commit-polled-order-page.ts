import type { ReceiveInboundDeliveryCommand } from "../deliveries/receive-inbound-delivery-command.js";

export interface RejectedInboundDeliveryCommand {
    readonly externalEventId: string;
    readonly providerPayloadHash: string;
    readonly providerPayloadJson: string;
    readonly mappingVersion: string;
    readonly errorCode: string;
}

export interface CommitPolledOrderPageCommand {
    readonly connectorId: string;
    readonly expectedCheckpointVersion: number;
    readonly leaseOwner: string;
    readonly leaseToken: string;
    readonly polledAt: Date;
    readonly nextCursor: string;
    readonly deliveries: readonly ReceiveInboundDeliveryCommand[];
    readonly rejectedChanges: readonly RejectedInboundDeliveryCommand[];
}

export type CommitPolledOrderPageResult =
    | {
          readonly outcome: "COMMITTED";
          readonly checkpointVersion: number;
          readonly createdDeliveries: number;
          readonly createdRejections: number;
          readonly equivalentReplays: number;
      }
    | { readonly outcome: "STALE_CHECKPOINT" }
    | {
          readonly outcome: "PAYLOAD_CONFLICT";
          readonly externalEventId: string;
      };

export interface PolledOrderPageRepository {
    commitPage(command: CommitPolledOrderPageCommand): Promise<CommitPolledOrderPageResult>;
}
