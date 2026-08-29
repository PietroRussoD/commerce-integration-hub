import type {
    ClaimedInboundDelivery,
    ClaimInboundDeliveriesCommand,
    InboundDeliveryClaimRepository
} from "../../application/deliveries/claim-inbound-deliveries.js";
import type { GatewayDatabase } from "./database.js";

import type { Kysely } from "kysely";

export class KyselyInboundDeliveryClaimRepository implements InboundDeliveryClaimRepository {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public claimEligible(
        command: ClaimInboundDeliveriesCommand
    ): Promise<readonly ClaimedInboundDelivery[]> {
        return this.database.transaction().execute(async (transaction) => {
            const candidates = await transaction
                .selectFrom("inbound_deliveries as delivery")
                .innerJoin(
                    "connector_configurations as connector",
                    "connector.id",
                    "delivery.connector_id"
                )
                .select([
                    "delivery.id",
                    "delivery.connector_id",
                    "delivery.canonical_payload"
                ])
                .where("delivery.status", "in", ["RECEIVED", "RETRY_WAIT"])
                .where("delivery.next_attempt_at", "<=", command.claimedAt)
                .where("connector.status", "=", "ACTIVE")
                .orderBy("delivery.next_attempt_at", "asc")
                .orderBy("delivery.received_at", "asc")
                .forUpdate("delivery")
                .skipLocked()
                .limit(command.limit)
                .execute();

            if (candidates.length === 0) {
                return [];
            }

            await transaction
                .updateTable("inbound_deliveries")
                .set({
                    lease_expires_at: command.leaseExpiresAt,
                    lease_owner: command.workerId,
                    lease_token: command.leaseToken,
                    status: "FORWARDING",
                    updated_at: command.claimedAt
                })
                .where(
                    "id",
                    "in",
                    candidates.map(({ id }) => id)
                )
                .execute();

            return candidates.map((candidate) => ({
                canonicalOrder: candidate.canonical_payload,
                connectorId: candidate.connector_id,
                deliveryId: candidate.id,
                leaseToken: command.leaseToken
            }));
        });
    }
}
