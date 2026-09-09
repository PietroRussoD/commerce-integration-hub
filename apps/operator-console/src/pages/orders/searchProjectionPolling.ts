import type { OperatorOrderSearchProjectionStatus } from "../../api/integrationCoreClient";

const ACTIVE_REINDEX_POLL_INTERVAL_MS = 5_000;

export function getSearchProjectionStatusRefetchInterval(
  status: OperatorOrderSearchProjectionStatus | undefined,
): number | false {
  return status?.reindex.phase !== undefined && status.reindex.phase !== "IDLE" ? ACTIVE_REINDEX_POLL_INTERVAL_MS : false;
}
