import { sql, type Kysely } from "kysely";

import type { GatewayDatabase } from "./database.js";

export class KyselyDatabaseReadiness {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public isReady(): Promise<boolean> {
        return evaluateDatabaseReadiness(() =>
            this.database.transaction().execute(async (transaction) => {
                await sql`SET LOCAL statement_timeout = 1000`.execute(transaction);
                await sql`SELECT 1`.execute(transaction);
            })
        );
    }
}

export async function evaluateDatabaseReadiness(
    probe: () => Promise<unknown>
): Promise<boolean> {
    try {
        await probe();
        return true;
    } catch {
        return false;
    }
}
