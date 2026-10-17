import { useTranslation } from "react-i18next";

import { useAccessToken } from "../../auth/accessTokenContext";
import { replayRequestKey, useReplayRequests } from "./replayRequestsContext";

export function ReplayDeliveryFeedback({ deliveryId }: { deliveryId: string }) {
  const { t } = useTranslation();
  const { cacheScope } = useAccessToken();
  const { requests } = useReplayRequests();
  const response = requests.get(replayRequestKey(cacheScope, deliveryId))?.lastResponse;

  return (
    <div
      role={response === undefined ? undefined : "status"}
      aria-label={response === undefined ? undefined : t("deliveryDetail.replay.feedbackLabel")}
      aria-live="polite"
      aria-atomic="true"
    >
      {response !== undefined ? (
        <div className="mb-5 rounded-md border border-app-border bg-app-surface p-4 text-sm">
          <p className="break-words font-semibold text-app-foreground">
            {t(response.outcome === "REPLAYED" ? "deliveryDetail.replay.replayed" : "deliveryDetail.replay.inProgress", {
              commandId: response.commandId,
            })}
          </p>
          <p className="mt-2 text-app-foreground-secondary">
            {t(response.outcome === "REPLAYED" ? "deliveryDetail.replay.replayedExplanation" : "deliveryDetail.replay.inProgressExplanation")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
