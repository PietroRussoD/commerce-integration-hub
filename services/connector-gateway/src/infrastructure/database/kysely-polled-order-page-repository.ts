import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import type { ReceiveInboundDeliveryCommand } from "../../application/deliveries/receive-inbound-delivery-command.js";
import type {
    CommitPolledOrderPageCommand,
    CommitPolledOrderPageResult,
    PolledOrderPageRepository,
    RejectedInboundDeliveryCommand
} from "../../application/polling/commit-polled-order-page.js";
import type { GatewayDatabase } from "./database.js";

type NonCommittedResult = Exclude<CommitPolledOrderPageResult, { outcome: "COMMITTED" }>;

class PageCommitRejected extends Error {
    public constructor(public readonly result: NonCommittedResult) {
        super(result.outcome);
    }
}

export class KyselyPolledOrderPageRepository implements PolledOrderPageRepository {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public async commitPage(
        command: CommitPolledOrderPageCommand
    ): Promise<CommitPolledOrderPageResult> {
        try {
            return await this.database.transaction().execute(async (transaction) => {
                await lockCurrentCheckpoint(transaction, command);

                let createdDeliveries = 0;
                let createdRejections = 0;
                let equivalentReplays = 0;

                for (const delivery of command.deliveries) {
                    const outcome = await persistDelivery(
                        transaction,
                        command.connectorId,
                        delivery,
                        command.polledAt
                    );
                    if (outcome === "CREATED") {
                        createdDeliveries += 1;
                    } else {
                        equivalentReplays += 1;
                    }
                }

                for (const rejection of command.rejectedChanges) {
                    const outcome = await persistRejection(
                        transaction,
                        command.connectorId,
                        rejection,
                        command.polledAt
                    );
                    if (outcome === "CREATED") {
                        createdRejections += 1;
                    } else {
                        equivalentReplays += 1;
                    }
                }

                const checkpoint = await transaction
                    .updateTable("polling_checkpoints")
                    .set({
                        cursor: command.nextCursor,
                        last_polled_at: command.polledAt,
                        last_successful_poll_at: command.polledAt,
                        updated_at: command.polledAt,
                        version: sql`version + 1`
                    })
                    .where("connector_id", "=", command.connectorId)
                    .where("version", "=", command.expectedCheckpointVersion)
                    .where("lease_owner", "=", command.leaseOwner)
                    .where("lease_token", "=", command.leaseToken)
                    .where("lease_expires_at", ">", command.polledAt)
                    .returning("version")
                    .executeTakeFirst();
                if (checkpoint === undefined) {
                    throw new PageCommitRejected({ outcome: "STALE_CHECKPOINT" });
                }

                return {
                    outcome: "COMMITTED",
                    checkpointVersion: checkpoint.version,
                    createdDeliveries,
                    createdRejections,
                    equivalentReplays
                };
            });
        } catch (error) {
            if (error instanceof PageCommitRejected) {
                return error.result;
            }
            throw error;
        }
    }
}

async function lockCurrentCheckpoint(
    transaction: Transaction<GatewayDatabase>,
    command: CommitPolledOrderPageCommand
): Promise<void> {
    const checkpoint = await transaction
        .selectFrom("polling_checkpoints")
        .select(["version", "lease_owner", "lease_token", "lease_expires_at"])
        .where("connector_id", "=", command.connectorId)
        .forUpdate()
        .executeTakeFirst();

    if (
        checkpoint === undefined ||
        checkpoint.version !== command.expectedCheckpointVersion ||
        checkpoint.lease_owner !== command.leaseOwner ||
        checkpoint.lease_token !== command.leaseToken ||
        checkpoint.lease_expires_at === null ||
        checkpoint.lease_expires_at <= command.polledAt
    ) {
        throw new PageCommitRejected({ outcome: "STALE_CHECKPOINT" });
    }
}

async function persistDelivery(
    transaction: Transaction<GatewayDatabase>,
    connectorId: string,
    command: ReceiveInboundDeliveryCommand,
    receivedAt: Date
): Promise<"CREATED" | "EQUIVALENT_REPLAY"> {
    return persistRecord(transaction, {
        canonicalOrder: command.canonicalOrder,
        completedAt: null,
        connectorId,
        errorCode: null,
        externalEventId: command.externalEventId,
        mappingVersion: command.mappingVersion,
        providerPayloadHash: command.providerPayloadHash,
        providerPayloadJson: command.providerPayloadJson,
        receivedAt,
        status: "RECEIVED"
    });
}

async function persistRejection(
    transaction: Transaction<GatewayDatabase>,
    connectorId: string,
    command: RejectedInboundDeliveryCommand,
    receivedAt: Date
): Promise<"CREATED" | "EQUIVALENT_REPLAY"> {
    return persistRecord(transaction, {
        canonicalOrder: null,
        completedAt: receivedAt,
        connectorId,
        errorCode: command.errorCode,
        externalEventId: command.externalEventId,
        mappingVersion: command.mappingVersion,
        providerPayloadHash: command.providerPayloadHash,
        providerPayloadJson: command.providerPayloadJson,
        receivedAt,
        status: "PERMANENT_FAILURE"
    });
}

interface PersistRecordCommand {
    readonly canonicalOrder: ReceiveInboundDeliveryCommand["canonicalOrder"] | null;
    readonly completedAt: Date | null;
    readonly connectorId: string;
    readonly errorCode: string | null;
    readonly externalEventId: string;
    readonly mappingVersion: string;
    readonly providerPayloadHash: string;
    readonly providerPayloadJson: string;
    readonly receivedAt: Date;
    readonly status: "PERMANENT_FAILURE" | "RECEIVED";
}

async function persistRecord(
    transaction: Transaction<GatewayDatabase>,
    command: PersistRecordCommand
): Promise<"CREATED" | "EQUIVALENT_REPLAY"> {
    const inserted = await transaction
        .insertInto("inbound_deliveries")
        .values({
            id: randomUUID(),
            connector_id: command.connectorId,
            external_event_id: command.externalEventId,
            provider_payload_hash: command.providerPayloadHash,
            raw_payload: sql<Record<string, unknown>>`${command.providerPayloadJson}::jsonb`,
            canonical_payload: command.canonicalOrder,
            mapping_version: command.mappingVersion,
            status: command.status,
            lease_owner: null,
            lease_expires_at: null,
            error_code: command.errorCode,
            safe_error_message: null,
            last_http_status: null,
            correlation_id: null,
            last_core_order_id: null,
            received_at: command.receivedAt,
            updated_at: command.receivedAt,
            completed_at: command.completedAt
        })
        .onConflict((conflict) =>
            conflict.columns(["connector_id", "external_event_id"]).doNothing()
        )
        .returning("id")
        .executeTakeFirst();
    if (inserted !== undefined) {
        return "CREATED";
    }

    const existing = await transaction
        .selectFrom("inbound_deliveries")
        .select("provider_payload_hash")
        .where("connector_id", "=", command.connectorId)
        .where("external_event_id", "=", command.externalEventId)
        .executeTakeFirstOrThrow();
    if (existing.provider_payload_hash !== command.providerPayloadHash) {
        throw new PageCommitRejected({
            outcome: "PAYLOAD_CONFLICT",
            externalEventId: command.externalEventId
        });
    }
    return "EQUIVALENT_REPLAY";
}
