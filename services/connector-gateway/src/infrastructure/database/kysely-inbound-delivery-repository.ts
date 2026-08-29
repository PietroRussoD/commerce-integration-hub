import { randomUUID } from "node:crypto";

import { sql, type Kysely } from "kysely";

import type { ReceiveInboundDeliveryCommand } from "../../application/deliveries/receive-inbound-delivery-command.js";
import type {
    InboundDeliveryRepository,
    ReceiveInboundDeliveryResult
} from "../../application/deliveries/receive-inbound-delivery.js";
import type { GatewayDatabase } from "./database.js";

export class KyselyInboundDeliveryRepository implements InboundDeliveryRepository {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public receive(
        connectorId: string,
        command: ReceiveInboundDeliveryCommand
    ): Promise<ReceiveInboundDeliveryResult> {
        return this.database.transaction().execute(async (transaction) => {
            const inserted = await transaction
                .insertInto("inbound_deliveries")
                .values({
                    id: randomUUID(),
                    connector_id: connectorId,
                    external_event_id: command.externalEventId,
                    provider_payload_hash: command.providerPayloadHash,
                    raw_payload: sql<Record<string, unknown>>`${command.providerPayloadJson}::jsonb`,
                    canonical_payload: command.canonicalOrder,
                    mapping_version: command.mappingVersion,
                    lease_owner: null,
                    lease_expires_at: null,
                    error_code: null,
                    safe_error_message: null,
                    last_http_status: null,
                    correlation_id: null,
                    last_core_order_id: null,
                    completed_at: null
                })
                .onConflict((conflict) =>
                    conflict.columns(["connector_id", "external_event_id"]).doNothing()
                )
                .returning("id")
                .executeTakeFirst();

            if (inserted !== undefined) {
                return { deliveryId: inserted.id, outcome: "CREATED" };
            }

            // The unique constraint serializes concurrent receipts before this lookup.
            const existing = await transaction
                .selectFrom("inbound_deliveries")
                .select(["id", "provider_payload_hash"])
                .where("connector_id", "=", connectorId)
                .where("external_event_id", "=", command.externalEventId)
                .executeTakeFirstOrThrow();

            return {
                deliveryId: existing.id,
                outcome:
                    existing.provider_payload_hash === command.providerPayloadHash
                        ? "EQUIVALENT_REPLAY"
                        : "PAYLOAD_CONFLICT"
            };
        });
    }
}
