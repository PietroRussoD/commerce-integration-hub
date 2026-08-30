import { sql, type Kysely } from "kysely";

import type {
    InboundDeliveryAttemptRepository,
    StartInboundDeliveryAttemptCommand,
    StartInboundDeliveryAttemptResult
} from "../../application/deliveries/start-inbound-delivery-attempt.js";
import type {
    CompleteDeliveredInboundDeliveryAttemptCommand,
    CompleteDeliveredInboundDeliveryAttemptResult,
    DeliveredInboundDeliveryAttemptRepository
} from "../../application/deliveries/complete-delivered-inbound-delivery-attempt.js";
import type {
    CompleteRetryableInboundDeliveryAttemptCommand,
    CompleteRetryableInboundDeliveryAttemptResult,
    RetryableInboundDeliveryAttemptRepository
} from "../../application/deliveries/complete-retryable-inbound-delivery-attempt.js";
import type {
    CompleteTerminalInboundDeliveryAttemptCommand,
    CompleteTerminalInboundDeliveryAttemptResult,
    TerminalInboundDeliveryAttemptRepository
} from "../../application/deliveries/complete-terminal-inbound-delivery-attempt.js";
import type {
    ExpiredInboundDelivery,
    ExpiredInboundDeliveryRepository,
    FindExpiredInboundDeliveriesCommand,
    RecoverExpiredInboundDeliveryCommand,
    RecoverExpiredInboundDeliveryResult
} from "../../application/deliveries/recover-expired-inbound-deliveries.js";
import type { GatewayDatabase } from "./database.js";

export class KyselyInboundDeliveryAttemptRepository
    implements
        InboundDeliveryAttemptRepository,
        DeliveredInboundDeliveryAttemptRepository,
        ExpiredInboundDeliveryRepository,
        RetryableInboundDeliveryAttemptRepository,
        TerminalInboundDeliveryAttemptRepository
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
                .returning(["attempt_count", "received_at"])
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
                deliveryReceivedAt: delivery.received_at,
                outcome: "STARTED",
                startedAt: command.startedAt
            };
        });
    }

    public findExpired(
        command: FindExpiredInboundDeliveriesCommand
    ): Promise<readonly ExpiredInboundDelivery[]> {
        return this.database
            .selectFrom("inbound_deliveries as delivery")
            .leftJoin("delivery_attempts as attempt", (join) =>
                join
                    .onRef("attempt.delivery_id", "=", "delivery.id")
                    .onRef("attempt.attempt_number", "=", "delivery.attempt_count")
                    .on("attempt.completed_at", "is", null)
            )
            .select([
                "attempt.id as attemptId",
                "delivery.attempt_count as attemptNumber",
                "delivery.id as deliveryId",
                "delivery.received_at as deliveryReceivedAt",
                "delivery.lease_owner as leaseOwner",
                "delivery.lease_token as leaseToken"
            ])
            .where("delivery.status", "=", "FORWARDING")
            .where("delivery.lease_expires_at", "<=", command.expiredAt)
            .orderBy("delivery.lease_expires_at", "asc")
            .orderBy("delivery.received_at", "asc")
            .limit(command.limit)
            .$narrowType<{ leaseOwner: string; leaseToken: string }>()
            .execute();
    }

    public recoverExpired(
        command: RecoverExpiredInboundDeliveryCommand
    ): Promise<RecoverExpiredInboundDeliveryResult> {
        return this.database.transaction().execute(async (transaction) => {
            const delivery = await transaction
                .updateTable("inbound_deliveries")
                .set({
                    completed_at:
                        command.targetStatus === "EXHAUSTED" ? command.recoveredAt : null,
                    error_code: command.errorCode,
                    last_core_order_id: null,
                    last_http_status: null,
                    lease_expires_at: null,
                    lease_owner: null,
                    lease_token: null,
                    next_attempt_at:
                        command.targetStatus === "RETRY_WAIT"
                            ? command.nextAttemptAt
                            : command.recoveredAt,
                    safe_error_message: null,
                    status: command.targetStatus,
                    updated_at: command.recoveredAt
                })
                .where("id", "=", command.deliveryId)
                .where("status", "=", "FORWARDING")
                .where("attempt_count", "=", command.attemptNumber)
                .where("lease_owner", "=", command.leaseOwner)
                .where("lease_token", "=", command.leaseToken)
                .where("lease_expires_at", "<=", command.recoveredAt)
                .returning("id")
                .executeTakeFirst();

            if (delivery === undefined) {
                return { outcome: "STALE_CLAIM" };
            }

            const openAttempt = await transaction
                .selectFrom("delivery_attempts")
                .select("id")
                .where("delivery_id", "=", command.deliveryId)
                .where("attempt_number", "=", command.attemptNumber)
                .where("completed_at", "is", null)
                .executeTakeFirst();

            if ((openAttempt?.id ?? null) !== command.attemptId) {
                throw new Error("Current open delivery attempt changed during recovery");
            }

            if (command.attemptId !== null) {
                await transaction
                    .updateTable("delivery_attempts")
                    .set({
                        completed_at: command.recoveredAt,
                        duration_ms: sql<number>`GREATEST(
                            0,
                            FLOOR(EXTRACT(EPOCH FROM (${command.recoveredAt} - started_at)) * 1000)
                        )::integer`,
                        error_code: command.errorCode,
                        http_status: null,
                        outcome: "RETRYABLE_FAILURE",
                        safe_error_message: null
                    })
                    .where("id", "=", command.attemptId)
                    .where("delivery_id", "=", command.deliveryId)
                    .where("attempt_number", "=", command.attemptNumber)
                    .where("completed_at", "is", null)
                    .executeTakeFirstOrThrow();
            }

            return { outcome: "RECOVERED" };
        });
    }

    public completeDelivered(
        command: CompleteDeliveredInboundDeliveryAttemptCommand
    ): Promise<CompleteDeliveredInboundDeliveryAttemptResult> {
        return this.database.transaction().execute(async (transaction) => {
            const delivery = await transaction
                .updateTable("inbound_deliveries")
                .set({
                    completed_at: command.completedAt,
                    error_code: null,
                    last_core_order_id: command.coreOrderId,
                    last_http_status: command.httpStatus,
                    lease_expires_at: null,
                    lease_owner: null,
                    lease_token: null,
                    safe_error_message: null,
                    status: "DELIVERED",
                    updated_at: command.completedAt
                })
                .where("id", "=", command.deliveryId)
                .where("status", "=", "FORWARDING")
                .where("lease_owner", "=", command.workerId)
                .where("lease_token", "=", command.leaseToken)
                .returning("attempt_count")
                .executeTakeFirst();

            if (delivery === undefined) {
                return { outcome: "STALE_CLAIM" };
            }

            const attempt = await transaction
                .updateTable("delivery_attempts")
                .set({
                    completed_at: command.completedAt,
                    duration_ms: sql<number>`GREATEST(
                        0,
                        FLOOR(EXTRACT(EPOCH FROM (${command.completedAt} - started_at)) * 1000)
                    )::integer`,
                    error_code: null,
                    http_status: command.httpStatus,
                    outcome: "DELIVERED",
                    safe_error_message: null
                })
                .where("id", "=", command.attemptId)
                .where("delivery_id", "=", command.deliveryId)
                .where("attempt_number", "=", delivery.attempt_count)
                .where("completed_at", "is", null)
                .returning("id")
                .executeTakeFirst();

            if (attempt === undefined) {
                throw new Error("Current delivery attempt is missing or already completed");
            }
            return { outcome: "COMPLETED" };
        });
    }

    public completeRetryable(
        command: CompleteRetryableInboundDeliveryAttemptCommand
    ): Promise<CompleteRetryableInboundDeliveryAttemptResult> {
        return this.database.transaction().execute(async (transaction) => {
            const delivery = await transaction
                .updateTable("inbound_deliveries")
                .set({
                    completed_at:
                        command.targetStatus === "EXHAUSTED" ? command.completedAt : null,
                    error_code: command.errorCode,
                    last_core_order_id: null,
                    last_http_status: command.httpStatus ?? null,
                    lease_expires_at: null,
                    lease_owner: null,
                    lease_token: null,
                    next_attempt_at:
                        command.targetStatus === "RETRY_WAIT"
                            ? command.nextAttemptAt
                            : command.completedAt,
                    safe_error_message: null,
                    status: command.targetStatus,
                    updated_at: command.completedAt
                })
                .where("id", "=", command.deliveryId)
                .where("status", "=", "FORWARDING")
                .where("lease_owner", "=", command.workerId)
                .where("lease_token", "=", command.leaseToken)
                .returning("attempt_count")
                .executeTakeFirst();

            if (delivery === undefined) {
                return { outcome: "STALE_CLAIM" };
            }
            if (delivery.attempt_count !== command.attemptNumber) {
                throw new Error("Current delivery attempt number does not match");
            }

            const attempt = await transaction
                .updateTable("delivery_attempts")
                .set({
                    completed_at: command.completedAt,
                    duration_ms: sql<number>`GREATEST(
                        0,
                        FLOOR(EXTRACT(EPOCH FROM (${command.completedAt} - started_at)) * 1000)
                    )::integer`,
                    error_code: command.errorCode,
                    http_status: command.httpStatus ?? null,
                    outcome: "RETRYABLE_FAILURE",
                    safe_error_message: null
                })
                .where("id", "=", command.attemptId)
                .where("delivery_id", "=", command.deliveryId)
                .where("attempt_number", "=", command.attemptNumber)
                .where("completed_at", "is", null)
                .returning("id")
                .executeTakeFirst();

            if (attempt === undefined) {
                throw new Error("Current delivery attempt is missing or already completed");
            }
            return { outcome: "COMPLETED" };
        });
    }

    public completeTerminal(
        command: CompleteTerminalInboundDeliveryAttemptCommand
    ): Promise<CompleteTerminalInboundDeliveryAttemptResult> {
        return this.database.transaction().execute(async (transaction) => {
            const delivery = await transaction
                .updateTable("inbound_deliveries")
                .set({
                    completed_at: command.completedAt,
                    error_code: command.errorCode,
                    last_core_order_id: null,
                    last_http_status: command.httpStatus,
                    lease_expires_at: null,
                    lease_owner: null,
                    lease_token: null,
                    next_attempt_at: command.completedAt,
                    safe_error_message: null,
                    status: command.outcome,
                    updated_at: command.completedAt
                })
                .where("id", "=", command.deliveryId)
                .where("status", "=", "FORWARDING")
                .where("lease_owner", "=", command.workerId)
                .where("lease_token", "=", command.leaseToken)
                .returning(["attempt_count", "connector_id"])
                .executeTakeFirst();

            if (delivery === undefined) {
                return { outcome: "STALE_CLAIM" };
            }
            if (delivery.attempt_count !== command.attemptNumber) {
                throw new Error("Current delivery attempt number does not match");
            }

            const attempt = await transaction
                .updateTable("delivery_attempts")
                .set({
                    completed_at: command.completedAt,
                    duration_ms: sql<number>`GREATEST(
                        0,
                        FLOOR(EXTRACT(EPOCH FROM (${command.completedAt} - started_at)) * 1000)
                    )::integer`,
                    error_code: command.errorCode,
                    http_status: command.httpStatus,
                    outcome: command.outcome,
                    safe_error_message: null
                })
                .where("id", "=", command.attemptId)
                .where("delivery_id", "=", command.deliveryId)
                .where("attempt_number", "=", command.attemptNumber)
                .where("completed_at", "is", null)
                .returning("id")
                .executeTakeFirst();

            if (attempt === undefined) {
                throw new Error("Current delivery attempt is missing or already completed");
            }

            if (command.outcome === "BLOCKED_CONFIGURATION") {
                await transaction
                    .updateTable("connector_configurations")
                    .set({
                        status: "BLOCKED_CONFIGURATION",
                        updated_at: command.completedAt
                    })
                    .where("id", "=", delivery.connector_id)
                    .where("status", "=", "ACTIVE")
                    .execute();
            }
            return { outcome: "COMPLETED" };
        });
    }
}
