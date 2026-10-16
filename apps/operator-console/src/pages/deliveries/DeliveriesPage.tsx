import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  listOperatorDeliveries,
  type ListOperatorDeliveriesParameters,
  type OperatorDeliveryPage,
} from "../../api/connectorGatewayClient";
import { useAccessToken } from "../../auth/accessTokenContext";
import { IconButton } from "../../components/ui/IconButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatLabel } from "../orders/orderFormatters";

const PAGE_SIZE = 25;
const providerOptions = ["ALL", "ERP_B", "MARKETPLACE_A"] as const;
const statusOptions = [
  "ALL",
  "RECEIVED",
  "FORWARDING",
  "RETRY_WAIT",
  "EXHAUSTED",
  "DELIVERED",
  "PERMANENT_FAILURE",
  "BLOCKED_CONFIGURATION",
] as const;
const providerLabelKeys = {
  ALL: "deliveries.filter.all",
  ERP_B: "deliveries.provider.erpB",
  MARKETPLACE_A: "deliveries.provider.marketplaceA",
} as const;
const statusLabelKeys = {
  ALL: "deliveries.filter.all",
  BLOCKED_CONFIGURATION: "deliveries.status.blockedConfiguration",
  DELIVERED: "deliveries.status.delivered",
  EXHAUSTED: "deliveries.status.exhausted",
  FORWARDING: "deliveries.status.forwarding",
  PERMANENT_FAILURE: "deliveries.status.permanentFailure",
  RECEIVED: "deliveries.status.received",
  RETRY_WAIT: "deliveries.status.retryWait",
} as const;

type ProviderFilter = "ALL" | NonNullable<ListOperatorDeliveriesParameters["provider"]>;
type StatusFilter = "ALL" | NonNullable<ListOperatorDeliveriesParameters["status"]>;

export function DeliveriesPage() {
  const { t } = useTranslation();
  const { accessToken, identity, cacheScope } = useAccessToken();
  const [provider, setProvider] = useState<ProviderFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors.at(-1);
  const canReadDeliveries =
    accessToken !== undefined && (identity?.roles.has("operator") === true || identity?.roles.has("platform-admin") === true);
  const query = useQuery({
    queryKey: ["operator-deliveries", cacheScope, { cursor, limit: PAGE_SIZE, provider, status }],
    queryFn: ({ signal }) =>
      listOperatorDeliveries({
        accessToken: accessToken!,
        cursor,
        limit: PAGE_SIZE,
        provider: provider === "ALL" ? undefined : provider,
        signal,
        status: status === "ALL" ? undefined : status,
      }),
    enabled: canReadDeliveries,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === cacheScope ? previous : undefined,
  });

  function updateFilters(nextProvider: ProviderFilter, nextStatus: StatusFilter) {
    setProvider(nextProvider);
    setStatus(nextStatus);
    setCursors([undefined]);
  }

  return (
    <section aria-labelledby="deliveries-heading">
      <PageHeader
        titleId="deliveries-heading"
        title={t("deliveries.title")}
        description={query.data === undefined ? "\u00a0" : t("deliveries.total", { count: query.data.items.length })}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-app-foreground-secondary">
              {t("deliveries.filter.provider")}
              <select
                value={provider}
                onChange={(event) => updateFilters(event.target.value as ProviderFilter, status)}
                className="h-9 min-w-36 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring"
              >
                {providerOptions.map((option) => <option key={option} value={option}>{t(providerLabelKeys[option])}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-app-foreground-secondary">
              {t("deliveries.filter.status")}
              <select
                value={status}
                onChange={(event) => updateFilters(provider, event.target.value as StatusFilter)}
                className="h-9 min-w-44 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring"
              >
                {statusOptions.map((option) => <option key={option} value={option}>{t(statusLabelKeys[option])}</option>)}
              </select>
            </label>
            <IconButton
              label={t("deliveries.actions.refresh")}
              disabled={!canReadDeliveries || query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw aria-hidden="true" size={17} className={query.isFetching ? "animate-spin" : undefined} />
            </IconButton>
          </div>
        }
      />

      <div className="mt-5 overflow-hidden rounded-md border border-app-border bg-app-surface">
        {!canReadDeliveries ? <DeliveryAccessNotice hasToken={accessToken !== undefined} /> : null}
        {canReadDeliveries && query.isPending ? <DeliveriesLoading /> : null}
        {canReadDeliveries && query.isError ? <DeliveriesError onRetry={() => void query.refetch()} /> : null}
        {canReadDeliveries && query.data !== undefined ? <DeliveriesTable page={query.data} /> : null}
      </div>

      {canReadDeliveries && query.data !== undefined && (cursors.length > 1 || query.data.nextCursor !== null) ? (
        <Pagination
          hasNext={query.data.nextCursor !== null}
          hasPrevious={cursors.length > 1}
          onNext={() => setCursors((current) => [...current, query.data!.nextCursor!])}
          onPrevious={() => setCursors((current) => current.slice(0, -1))}
        />
      ) : null}
    </section>
  );
}

function DeliveryAccessNotice({ hasToken }: { hasToken: boolean }) {
  const { t } = useTranslation();
  return <p role="alert" className="px-6 py-16 text-center text-sm text-app-foreground-muted">{t(hasToken ? "deliveries.access.forbidden" : "deliveries.access.required")}</p>;
}

function DeliveriesTable({ page }: { page: OperatorDeliveryPage }) {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  if (page.items.length === 0) return <p className="px-6 py-16 text-center text-sm text-app-foreground-muted">{t("deliveries.empty")}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="border-b border-app-border bg-app-canvas text-xs font-semibold text-app-foreground-secondary">
          <tr>
            <th scope="col" className="px-4 py-3">{t("deliveries.table.event")}</th>
            <th scope="col" className="px-4 py-3">{t("deliveries.table.provider")}</th>
            <th scope="col" className="px-4 py-3">{t("deliveries.table.status")}</th>
            <th scope="col" className="px-4 py-3 text-right">{t("deliveries.table.attempts")}</th>
            <th scope="col" className="px-4 py-3">{t("deliveries.table.received")}</th>
            <th scope="col" className="px-4 py-3">{t("deliveries.table.error")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-app-surface-muted">
          {page.items.map((delivery) => (
            <tr key={delivery.deliveryId} className="hover:bg-app-canvas">
              <td className="px-4 py-3.5">
                <Link to={`/deliveries/${delivery.deliveryId}`} className="font-medium text-app-foreground underline-offset-4 hover:text-app-brand-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">{delivery.externalEventId}</Link>
                <p className="mt-0.5 font-mono text-xs text-app-foreground-faint">{shortenId(delivery.deliveryId)}</p>
              </td>
              <td className="px-4 py-3.5 text-app-foreground-secondary">{t(providerLabelKeys[delivery.provider])}</td>
              <td className="px-4 py-3.5"><StatusBadge status={delivery.status}>{t(statusLabelKeys[delivery.status])}</StatusBadge></td>
              <td className="px-4 py-3.5 text-right tabular-nums text-app-foreground-secondary">{delivery.attemptCount}</td>
              <td className="px-4 py-3.5 whitespace-nowrap text-app-foreground-secondary">{formatDateTime(delivery.receivedAt, locale)}</td>
              <td className="max-w-80 px-4 py-3.5">
                {delivery.errorCode === null ? <span className="text-app-foreground-faint">-</span> : <p className="truncate font-mono text-xs text-red-800" title={delivery.errorCode}>{formatLabel(delivery.errorCode)}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveriesLoading() {
  const { t } = useTranslation();
  return <div role="status" aria-label={t("deliveries.loading")} className="space-y-3 px-4 py-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-app-surface-muted" />)}</div>;
}

function DeliveriesError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">{t("deliveries.error")}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
        <RefreshCw aria-hidden="true" size={16} />
        {t("deliveries.actions.retry")}
      </button>
    </div>
  );
}

function Pagination({ hasNext, hasPrevious, onNext, onPrevious }: { hasNext: boolean; hasPrevious: boolean; onNext: () => void; onPrevious: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex justify-end gap-1">
      <IconButton label={t("deliveries.actions.previousPage")} disabled={!hasPrevious} onClick={onPrevious}><ChevronLeft aria-hidden="true" size={18} /></IconButton>
      <IconButton label={t("deliveries.actions.nextPage")} disabled={!hasNext} onClick={onNext}><ChevronRight aria-hidden="true" size={18} /></IconButton>
    </div>
  );
}

function shortenId(id: string): string {
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}
