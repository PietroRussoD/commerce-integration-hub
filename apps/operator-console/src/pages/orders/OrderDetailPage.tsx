import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { getOperatorOrder } from "../../api/integrationCoreClient";
import { PageHeader } from "../../components/ui/PageHeader";
import { OrderDetailContent } from "./OrderDetailContent";

export function OrderDetailPage() {
  const { t } = useTranslation();
  const orderId = useParams<{ orderId: string }>().orderId ?? "";
  const query = useQuery({
    queryKey: ["operator-order", orderId],
    queryFn: ({ signal }) => getOperatorOrder({ orderId, signal }),
    enabled: orderId.length > 0,
  });

  return (
    <section aria-labelledby="order-detail-heading">
      <PageHeader
        titleId="order-detail-heading"
        title={t("orderDetail.title")}
        description={<span className="break-all font-mono text-xs">{orderId}</span>}
        navigation={
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 text-sm font-medium text-app-foreground-secondary hover:text-app-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {t("orderDetail.backToOrders")}
          </Link>
        }
      />

      <div className="mt-5">
        {query.isPending ? <OrderDetailLoading /> : null}
        {query.isError ? <OrderDetailError onRetry={() => void query.refetch()} /> : null}
        {query.data !== undefined ? <OrderDetailContent order={query.data} /> : null}
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

function OrderDetailError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div role="alert" className="flex flex-col items-center rounded-md border border-app-border bg-app-surface px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">{t("orderDetail.error")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
      >
        <RefreshCw aria-hidden="true" size={16} />
        {t("orderDetail.retry")}
      </button>
    </div>
  );
}
