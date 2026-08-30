import { sql, type Kysely } from "kysely";

import type {
    InboundDeliveryAttemptRepository,
    StartInboundDeliveryAttemptCommand,
    StartInboundDeliveryAttemptResult
} from "../../application/deliveries/start-inbound-delivery-attempt.js";
import type { GatewayDatabase } from "./database.js";

export class KyselyInboundDeliveryAttemptRepository
    implements InboundDeliveryAttemptRepository
{
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public start(
        command: StartInboundDeliveryAttemptCommand
    ): Promise<StartInboundDeliveryAttemptResult> {
        return this.database.transaction().execute(async (transaction) => {
            const delivery = await transaction
                .updateTable("inbound_deliveries")
                .set({
                    attempt_count: sql`attempt_count + 1`,
                    updated_at: command.startedAt
                })
                .where("id", "=", command.deliveryId)
                .where("status", "=", "FORWARDING")
                .where("lease_owner", "=", command.workerId)
                .where("lease_token", "=", command.leaseToken)
                .where("lease_expires_at", ">", command.startedAt)
                .returning("attempt_count")
                .executeTakeFirst();

            if (delivery === undefined) {
                return { outcome: "STALE_CLAIM" };
            }

            await transaction
                .insertInto("delivery_attempts")
                .values({
                    attempt_number: delivery.attempt_count,
                    completed_at: null,
                    delivery_id: command.deliveryId,
                    duration_ms: null,
                    error_code: null,
                    http_status: null,
                    id: command.attemptId,
                    outcome: null,
                    safe_error_message: null,
                    started_at: command.startedAt,
                    trace_id: command.traceId ?? null
                })
                .execute();

            return {
                attemptId: command.attemptId,
                attemptNumber: delivery.attempt_count,
                outcome: "STARTED",
                startedAt: command.startedAt
            };
        });
    }
}
