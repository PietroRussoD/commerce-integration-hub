import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router-dom";

import { getOperatorDelivery } from "../../api/connectorGatewayClient";
import { AccessTokenButton } from "../../auth/AccessTokenButton";
import { useAccessToken } from "../../auth/accessTokenContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { DeliveryDetailContent } from "./DeliveryDetailContent";
import { ReplayDeliveryAction } from "./ReplayDeliveryAction";
import { ReplayDeliveryFeedback } from "./ReplayDeliveryFeedback";
import { replayRequestKey, useReplayRequests } from "./replayRequestsContext";
import { operatorDeliveryAccessFailure, retryOperatorDeliveryQuery } from "./operatorDeliveryQueries";

export function DeliveryDetailPage() {
  const { t, i18n } = useTranslation();
  const { accessToken, identity, cacheScope } = useAccessToken();
  const { requests } = useReplayRequests();
  const location = useLocation();
  const deliveryId = useParams<{ deliveryId: string }>().deliveryId ?? "";
  const canReadDelivery =
    accessToken !== undefined && (identity?.roles.has("operator") === true || identity?.roles.has("platform-admin") === true);
  const replayResponse = requests.get(replayRequestKey(cacheScope, deliveryId))?.lastResponse;
  const query = useQuery({
    queryKey: ["operator-delivery", cacheScope, deliveryId],
    queryFn: ({ signal }) => getOperatorDelivery({ accessToken: accessToken!, deliveryId, signal }),
    retry: retryOperatorDeliveryQuery,
    enabled: canReadDelivery && deliveryId.length > 0,
    refetchInterval: (currentQuery) => replayResponse !== undefined
      && currentQuery.state.data !== undefined
      && !isTerminalDeliveryStatus(currentQuery.state.data.status)
      ? 3_000
      : false,
  });

  const accessFailure = operatorDeliveryAccessFailure(query.error);
  const hasVisibleData = query.data !== undefined && accessFailure === undefined;
  const updatedAt = query.dataUpdatedAt > 0
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(query.dataUpdatedAt)
    : undefined;

  return (
    <section aria-labelledby="delivery-detail-heading">
      <PageHeader
        titleId="delivery-detail-heading"
        title={t("deliveryDetail.title")}
        description={<span className="break-all font-mono text-xs">{deliveryId}</span>}
        actions={hasVisibleData ? (
          <div className="flex flex-wrap items-center gap-3">
            {updatedAt !== undefined ? <p className="text-xs text-app-foreground-muted">{t("deliveryDetail.lastUpdated", { time: updatedAt })}</p> : null}
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              aria-busy={query.isFetching}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
            >
              <RefreshCw aria-hidden="true" size={16} className={query.isFetching ? "animate-spin" : undefined} />
              {t(query.isFetching ? "deliveryDetail.refreshing" : "deliveryDetail.refresh")}
            </button>
          </div>
        ) : undefined}
        navigation={
          <Link
            to={{ pathname: "/deliveries", search: location.search }}
            state={location.state}
            className="inline-flex items-center gap-2 text-sm font-medium text-app-foreground-secondary hover:text-app-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {t("deliveryDetail.backToDeliveries")}
          </Link>
        }
      />

      <div className="mt-5">
        {!canReadDelivery ? <AccessNotice hasToken={accessToken !== undefined} /> : null}
        {canReadDelivery && accessFailure === undefined ? <ReplayDeliveryFeedback deliveryId={deliveryId} /> : null}
        {canReadDelivery && query.isPending ? <DeliveryDetailLoading /> : null}
        {canReadDelivery && query.isError && !hasVisibleData ? <DeliveryDetailError error={query.error} onRetry={() => void query.refetch()} /> : null}
        {canReadDelivery && query.isError && hasVisibleData ? (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-app-border bg-app-surface px-4 py-3 text-sm text-app-foreground-secondary">
            <p>{t("deliveryDetail.refreshError")}</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 font-medium hover:bg-app-canvas disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
            >
              <RefreshCw aria-hidden="true" size={16} />
              {t("deliveryDetail.retry")}
            </button>
          </div>
        ) : null}
        {canReadDelivery && hasVisibleData ? (
          <div aria-busy={query.isFetching} className="space-y-5">
            {query.isFetching ? <p role="status" className="text-sm text-app-foreground-secondary">{t("deliveryDetail.refreshing")}</p> : null}
            <ReplayDeliveryAction
              key={`${cacheScope}:${query.data.deliveryId}`}
              accessToken={accessToken!}
              hasReplayPermission={identity?.roles.has("platform-admin") === true}
              delivery={query.data}
              isRefreshing={query.isFetching}
              isReadError={query.isError}
            />
            <DeliveryDetailContent delivery={query.data!} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function isTerminalDeliveryStatus(status: string): boolean {
  return ["BLOCKED_CONFIGURATION", "DELIVERED", "EXHAUSTED", "PERMANENT_FAILURE"].includes(status);
}

function AccessNotice({ hasToken }: { hasToken: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="rounded-md border border-app-border bg-app-surface px-6 py-16 text-center text-sm text-app-foreground-muted">
      <p>{t(hasToken ? "deliveries.access.forbidden" : "deliveries.access.required")}</p>
      <AccessTokenButton />
    </div>
  );
}

function DeliveryDetailLoading() {
  const { t } = useTranslation();
  return <div role="status" aria-label={t("deliveryDetail.loading")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-md bg-app-surface-muted" />)}</div>;
}

function DeliveryDetailError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const accessFailure = operatorDeliveryAccessFailure(error);
  return (
    <div role="alert" className="flex flex-col items-center rounded-md border border-app-border bg-app-surface px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">{t(accessFailure === undefined ? "deliveryDetail.error" : `deliveries.access.${accessFailure}`)}</p>
      {accessFailure !== undefined ? <AccessTokenButton /> : (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
          <RefreshCw aria-hidden="true" size={16} />
          {t("deliveryDetail.retry")}
        </button>
      )}
    </div>
  );
}
