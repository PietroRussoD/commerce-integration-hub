import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { getOperatorDelivery } from "../../api/connectorGatewayClient";
import { useAccessToken } from "../../auth/accessTokenContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { DeliveryDetailContent } from "./DeliveryDetailContent";
import { ReplayDeliveryAction } from "./ReplayDeliveryAction";

export function DeliveryDetailPage() {
  const { t } = useTranslation();
  const { accessToken, identity } = useAccessToken();
  const deliveryId = useParams<{ deliveryId: string }>().deliveryId ?? "";
  const canReadDelivery =
    accessToken !== undefined && (identity?.roles.has("operator") === true || identity?.roles.has("platform-admin") === true);
  const query = useQuery({
    queryKey: ["operator-delivery", { accessToken, deliveryId }],
    queryFn: ({ signal }) => getOperatorDelivery({ accessToken: accessToken!, deliveryId, signal }),
    enabled: canReadDelivery && deliveryId.length > 0,
  });

  return (
    <section aria-labelledby="delivery-detail-heading">
      <PageHeader
        titleId="delivery-detail-heading"
        title={t("deliveryDetail.title")}
        description={<span className="break-all font-mono text-xs">{deliveryId}</span>}
        navigation={
          <Link
            to="/deliveries"
            className="inline-flex items-center gap-2 text-sm font-medium text-app-foreground-secondary hover:text-app-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {t("deliveryDetail.backToDeliveries")}
          </Link>
        }
      />

      <div className="mt-5">
        {!canReadDelivery ? <AccessNotice hasToken={accessToken !== undefined} /> : null}
        {canReadDelivery && query.isPending ? <DeliveryDetailLoading /> : null}
        {canReadDelivery && query.isError ? <DeliveryDetailError onRetry={() => void query.refetch()} /> : null}
        {canReadDelivery && query.data !== undefined ? (
          <div className="space-y-5">
            <div className="flex justify-end">
              <ReplayDeliveryAction
                accessToken={accessToken!}
                canReplay={identity?.roles.has("platform-admin") === true && query.data.status === "EXHAUSTED"}
                deliveryId={query.data.deliveryId}
                onReplayAccepted={() => void query.refetch()}
              />
            </div>
            <DeliveryDetailContent delivery={query.data} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AccessNotice({ hasToken }: { hasToken: boolean }) {
  const { t } = useTranslation();
  return <p role="alert" className="rounded-md border border-app-border bg-app-surface px-6 py-16 text-center text-sm text-app-foreground-muted">{t(hasToken ? "deliveries.access.forbidden" : "deliveries.access.required")}</p>;
}

function DeliveryDetailLoading() {
  const { t } = useTranslation();
  return <div role="status" aria-label={t("deliveryDetail.loading")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-md bg-app-surface-muted" />)}</div>;
}

function DeliveryDetailError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center rounded-md border border-app-border bg-app-surface px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">{t("deliveryDetail.error")}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
        <RefreshCw aria-hidden="true" size={16} />
        {t("deliveryDetail.retry")}
      </button>
    </div>
  );
}
