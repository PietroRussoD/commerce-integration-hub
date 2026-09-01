import type { Kysely } from "kysely";

import type {
    AcquirePollingLeaseCommand,
    AcquiredPollingLease,
    PollingLeaseRepository
} from "../../application/polling/acquire-polling-lease.js";
import type { GatewayDatabase } from "./database.js";

export class KyselyPollingLeaseRepository implements PollingLeaseRepository {
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
}
