import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router-dom";

import { getOperatorOrder } from "../../api/integrationCoreClient";
import { AccessTokenButton } from "../../auth/AccessTokenButton";
import { useAccessToken } from "../../auth/accessTokenContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { OrderDetailContent } from "./OrderDetailContent";
import { operatorOrderAccessFailure, retryOperatorOrderQuery } from "./operatorOrderQueries";

export function OrderDetailPage() {
  const { t, i18n } = useTranslation();
  const { accessToken, cacheScope } = useAccessToken();
  const location = useLocation();
  const orderId = useParams<{ orderId: string }>().orderId ?? "";
  const query = useQuery({
    queryKey: ["operator-order", cacheScope, orderId],
    queryFn: ({ signal }) => getOperatorOrder({ accessToken, orderId, signal }),
    enabled: orderId.length > 0,
    retry: retryOperatorOrderQuery,
  });
  const hasVisibleData = query.data !== undefined && operatorOrderAccessFailure(query.error) === undefined;
  const updatedAt = query.dataUpdatedAt > 0
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(query.dataUpdatedAt)
    : undefined;

  return (
    <section aria-labelledby="order-detail-heading">
      <PageHeader
        titleId="order-detail-heading"
        title={t("orderDetail.title")}
        description={<span className="break-all font-mono text-xs">{orderId}</span>}
        actions={hasVisibleData ? (
          <div className="flex flex-wrap items-center gap-3">
            {updatedAt !== undefined ? <p className="text-xs text-app-foreground-muted">{t("orderDetail.lastUpdated", { time: updatedAt })}</p> : null}
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              aria-busy={query.isFetching}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
            >
              <RefreshCw aria-hidden="true" size={16} className={query.isFetching ? "animate-spin" : undefined} />
              {t(query.isFetching ? "orderDetail.refreshing" : "orderDetail.refresh")}
            </button>
          </div>
        ) : undefined}
        navigation={
          <Link
            to={{ pathname: "/orders", search: location.search }}
            className="inline-flex items-center gap-2 text-sm font-medium text-app-foreground-secondary hover:text-app-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {t("orderDetail.backToOrders")}
          </Link>
        }
      />

      <div className="mt-5">
        {query.isPending ? <OrderDetailLoading /> : null}
        {query.isError && !hasVisibleData ? <OrderDetailError error={query.error} onRetry={() => void query.refetch()} /> : null}
        {query.isError && hasVisibleData ? (
          <p role="alert" className="mb-4 rounded-md border border-app-border bg-app-surface px-4 py-3 text-sm text-app-foreground-secondary">
            {t("orderDetail.refreshError")}
          </p>
        ) : null}
        {hasVisibleData ? <div aria-busy={query.isFetching}>
          {query.isFetching ? <p role="status" className="mb-3 text-sm text-app-foreground-secondary">{t("orderDetail.refreshing")}</p> : null}
          <OrderDetailContent order={query.data!} />
        </div> : null}
      </div>
    </section>
  );
}

function OrderDetailLoading() {
  const { t } = useTranslation();

  return (
    <div role="status" aria-label={t("orderDetail.loading")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-md bg-app-surface-muted" />
      ))}
    </div>
  );
}

function OrderDetailError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const accessFailure = operatorOrderAccessFailure(error);

  return (
    <div role="alert" className="flex flex-col items-center rounded-md border border-app-border bg-app-surface px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">{t(accessFailure === undefined ? "orderDetail.error" : `orders.access.${accessFailure}`)}</p>
      {accessFailure !== undefined ? <AccessTokenButton /> : null}
      {accessFailure === undefined ? (
        <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
      >
        <RefreshCw aria-hidden="true" size={16} />
        {t("orderDetail.retry")}
      </button>
      ) : null}
    </div>
  );
}
