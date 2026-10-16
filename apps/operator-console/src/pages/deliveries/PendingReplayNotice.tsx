import { useTranslation } from "react-i18next";

import { useReplayRequests } from "./replayRequestsContext";

export function PendingReplayNotice() {
  const { t } = useTranslation();
  const { pendingDeliveryIds } = useReplayRequests();

  // Keep the live region mounted so new requests are announced. Do not reveal
  // delivery IDs, reasons or previous credentials after an identity change.
  return (
    <div role={pendingDeliveryIds.size > 0 ? "status" : undefined} aria-live="polite" aria-atomic="true">
      {pendingDeliveryIds.size > 0 ? (
        <p className="mb-5 rounded-md border border-app-border bg-app-surface p-4 text-sm text-app-foreground-secondary">
          {t("deliveryDetail.replay.pendingRequests", { count: pendingDeliveryIds.size })}
        </p>
      ) : null}
    </div>
  );
}
