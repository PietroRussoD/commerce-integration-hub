import { sql, type Kysely } from "kysely";

import type {
    AcquirePollingLeaseCommand,
    AcquiredPollingLease,
    PollingLeaseRepository
} from "../../application/polling/acquire-polling-lease.js";
import type {
    BlockPollingConnectorCommand,
    PollingConnectorRepository
} from "../../application/polling/block-polling-connector.js";
import type {
    PollingLeaseMaintenanceRepository,
    ReleasePollingLeaseCommand,
    RenewedPollingLease,
    RenewPollingLeaseCommand
} from "../../application/polling/maintain-polling-lease.js";
import type { GatewayDatabase } from "./database.js";

export class KyselyPollingLeaseRepository
    implements
        PollingConnectorRepository,
        PollingLeaseRepository,
        PollingLeaseMaintenanceRepository
{
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public async tryAcquire(
        command: AcquirePollingLeaseCommand
    ): Promise<AcquiredPollingLease | null> {
        const checkpoint = await this.database
            .updateTable("polling_checkpoints as checkpoint")
            .set({
                lease_expires_at: command.leaseExpiresAt,
                lease_owner: command.workerId,
                lease_token: command.leaseToken,
                updated_at: command.acquiredAt
            })
            .where("checkpoint.connector_id", "=", command.connectorId)
            .where((expression) =>
                expression.or([
                    expression("checkpoint.lease_expires_at", "is", null),
                    expression("checkpoint.lease_expires_at", "<=", command.acquiredAt)
                ])
            )
            .where((expression) =>
                expression.exists(
                    expression
                        .selectFrom("connector_configurations as connector")
                        .select("connector.id")
                        .whereRef("connector.id", "=", "checkpoint.connector_id")
                        .where("connector.mode", "=", "POLLING")
                        .where("connector.status", "=", "ACTIVE")
                )
            )
            .returning(["connector_id", "cursor", "version", "lease_expires_at", "lease_token"])
            .executeTakeFirst();

        if (
            checkpoint === undefined ||
            checkpoint.lease_expires_at === null ||
            checkpoint.lease_token === null
        ) {
            return null;
        }

        return {
            checkpointVersion: checkpoint.version,
            connectorId: checkpoint.connector_id,
            cursor: checkpoint.cursor,
            leaseExpiresAt: checkpoint.lease_expires_at,
            leaseToken: checkpoint.lease_token
        };
    }

    public async renew(command: RenewPollingLeaseCommand): Promise<RenewedPollingLease | null> {
        const checkpoint = await this.database
            .updateTable("polling_checkpoints as checkpoint")
            .set({
                lease_expires_at: sql<Date>`GREATEST(lease_expires_at, ${command.leaseExpiresAt})`,
                updated_at: command.renewedAt
            })
            .where("checkpoint.connector_id", "=", command.connectorId)
            .where("checkpoint.lease_owner", "=", command.workerId)
            .where("checkpoint.lease_token", "=", command.leaseToken)
            .where("checkpoint.lease_expires_at", ">", command.renewedAt)
            .where((expression) =>
                expression.exists(
                    expression
                        .selectFrom("connector_configurations as connector")
                        .select("connector.id")
                        .whereRef("connector.id", "=", "checkpoint.connector_id")
                        .where("connector.mode", "=", "POLLING")
                        .where("connector.status", "=", "ACTIVE")
                )
            )
            .returning("lease_expires_at")
            .executeTakeFirst();

        if (checkpoint === undefined || checkpoint.lease_expires_at === null) {
            return null;
        }
        return { leaseExpiresAt: checkpoint.lease_expires_at };
    }

    public async release(command: ReleasePollingLeaseCommand): Promise<boolean> {
        const checkpoint = await this.database
            .updateTable("polling_checkpoints")
            .set({
                lease_expires_at: null,
                lease_owner: null,
                lease_token: null,
                updated_at: command.releasedAt
            })
            .where("connector_id", "=", command.connectorId)
            .where("lease_owner", "=", command.workerId)
            .where("lease_token", "=", command.leaseToken)
            .returning("connector_id")
            .executeTakeFirst();

        return checkpoint !== undefined;
    }

    public blockConfiguration(command: BlockPollingConnectorCommand): Promise<boolean> {
        return this.database.transaction().execute(async (transaction) => {
            const checkpoint = await transaction
                .selectFrom("polling_checkpoints")
                .select("connector_id")
                .where("connector_id", "=", command.connectorId)
                .where("lease_owner", "=", command.workerId)
                .where("lease_token", "=", command.leaseToken)
                .where("lease_expires_at", ">", command.blockedAt)
                .forUpdate()
                .executeTakeFirst();

            if (checkpoint === undefined) {
                return false;
            }

            const connector = await transaction
                .updateTable("connector_configurations")
                .set({
                    status: "BLOCKED_CONFIGURATION",
                    updated_at: command.blockedAt,
                    version: sql`version + 1`
                })
                .where("id", "=", checkpoint.connector_id)
                .where("mode", "=", "POLLING")
                .where("status", "=", "ACTIVE")
                .returning("id")
                .executeTakeFirst();

            return connector !== undefined;
        });
    }
}
