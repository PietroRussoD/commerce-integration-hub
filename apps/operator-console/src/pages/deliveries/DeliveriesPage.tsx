import { useQuery } from "@tanstack/react-query";
import { ChevronFirst, ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import {
  listOperatorDeliveries,
  ConnectorGatewayApiError,
  type ListOperatorDeliveriesParameters,
  type OperatorDeliveryPage,
} from "../../api/connectorGatewayClient";
import { AccessTokenButton } from "../../auth/AccessTokenButton";
import { useAccessToken } from "../../auth/accessTokenContext";
import { IconButton } from "../../components/ui/IconButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime } from "../orders/orderFormatters";
import { operatorDeliveryAccessFailure, operatorDeliveryRequestFailure, retryOperatorDeliveryQuery } from "./operatorDeliveryQueries";
import { deliveryListNavigationState, previousDeliveryCursors } from "./deliveryListNavigation";

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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const providerValue = searchParams.get("provider");
  const statusValue = searchParams.get("status");
  const provider = providerOptions.find((option) => option === providerValue) ?? "ALL";
  const status = statusOptions.find((option) => option === statusValue) ?? "ALL";
  const cursor = searchParams.get("cursor") ?? undefined;
  const previousCursors = previousDeliveryCursors(location.state, searchParams.toString());
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
    retry: (failureCount, error) => !(error instanceof ConnectorGatewayApiError && error.status === 400)
      && retryOperatorDeliveryQuery(failureCount, error),
    enabled: canReadDeliveries,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === cacheScope ? previous : undefined,
  });

  const accessFailure = operatorDeliveryAccessFailure(query.error);
  const requestFailure = operatorDeliveryRequestFailure(query.error);
  const pageRejected = cursor !== undefined && query.error instanceof ConnectorGatewayApiError && query.error.status === 400;

  function changePage(nextCursor: string | undefined, previous: Array<string | null>) {
    const next = new URLSearchParams(searchParams);
    if (nextCursor === undefined) next.delete("cursor");
    else next.set("cursor", nextCursor);
    setSearchParams(next, { state: deliveryListNavigationState(next.toString(), previous) });
  }

  function updateFilters(nextProvider: ProviderFilter, nextStatus: StatusFilter) {
    const next = new URLSearchParams(searchParams);
    if (nextProvider === "ALL") next.delete("provider");
    else next.set("provider", nextProvider);
    if (nextStatus === "ALL") next.delete("status");
    else next.set("status", nextStatus);
    next.delete("cursor");
    setSearchParams(next, { state: null });
  }

  return (
    <section aria-labelledby="deliveries-heading">
      <PageHeader
        titleId="deliveries-heading"
        title={t("deliveries.title")}
        description={query.data === undefined || accessFailure !== undefined || requestFailure !== undefined || pageRejected ? "\u00a0" : t("deliveries.total", { count: query.data.items.length })}
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
        {canReadDeliveries && query.isError ? <DeliveriesError error={query.error} onRetry={() => void query.refetch()} onFirstPage={pageRejected ? () => changePage(undefined, []) : undefined} /> : null}
        {canReadDeliveries && query.data !== undefined && accessFailure === undefined && requestFailure === undefined && !pageRejected ? (
          <DeliveriesTable
            page={query.data}
            hasFilters={provider !== "ALL" || status !== "ALL"}
            onClearFilters={() => updateFilters("ALL", "ALL")}
          />
        ) : null}
      </div>

      {canReadDeliveries && query.data !== undefined && accessFailure === undefined && requestFailure === undefined && !pageRejected && (cursor !== undefined || query.data.nextCursor !== null) ? (
        <Pagination
          disabled={query.isFetching}
          hasFirst={cursor !== undefined}
          hasNext={query.data.nextCursor !== null}
          hasPrevious={previousCursors.length > 0}
          onFirst={() => changePage(undefined, [])}
          onNext={() => changePage(query.data!.nextCursor!, [...previousCursors, cursor ?? null])}
          onPrevious={() => changePage(previousCursors.at(-1) ?? undefined, previousCursors.slice(0, -1))}
        />
      ) : null}
    </section>
  );
}

function DeliveryAccessNotice({ hasToken }: { hasToken: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="px-6 py-16 text-center text-sm text-app-foreground-muted">
      <p>{t(hasToken ? "deliveries.access.forbidden" : "deliveries.access.required")}</p>
      <AccessTokenButton />
    </div>
  );
}

function DeliveriesTable({ page, hasFilters, onClearFilters }: { page: OperatorDeliveryPage; hasFilters: boolean; onClearFilters: () => void }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  if (page.items.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm text-app-foreground-muted">{t(hasFilters ? "deliveries.emptyFiltered" : "deliveries.empty")}</p>
        {hasFilters ? <button type="button" onClick={onClearFilters} className="mt-3 rounded-sm text-sm font-medium text-app-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">{t("deliveries.actions.clearFilters")}</button> : null}
      </div>
    );
  }

  return (
    <>
      <ul aria-label={t("deliveries.title")} className="divide-y divide-app-border lg:hidden">
        {page.items.map((delivery) => (
          <li key={delivery.deliveryId} className="p-4">
            <article className="space-y-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={{ pathname: `/deliveries/${delivery.deliveryId}`, search: location.search }}
                    state={location.state}
                    className="block break-all font-semibold text-app-foreground underline-offset-4 hover:text-app-brand-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
                  >
                    {delivery.externalEventId}
                  </Link>
                  <p className="mt-1 text-sm text-app-foreground-secondary">{t(providerLabelKeys[delivery.provider])}</p>
                </div>
                <StatusBadge status={delivery.status}>{t(statusLabelKeys[delivery.status])}</StatusBadge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-app-border pt-3 text-sm">
                <div>
                  <dt className="text-xs text-app-foreground-muted">{t("deliveries.table.attempts")}</dt>
                  <dd className="mt-0.5 tabular-nums text-app-foreground-secondary">{delivery.attemptCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-app-foreground-muted">{t("deliveries.table.received")}</dt>
                  <dd className="mt-0.5 text-app-foreground-secondary">{formatDateTime(delivery.receivedAt, locale)}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-app-foreground-muted">{t("deliveries.table.error")}</dt>
                  <dd className="mt-0.5 break-words text-app-foreground-secondary">
                    {delivery.errorCode === null
                      ? t("deliveries.noError")
                      : <code className="break-all font-mono text-xs text-red-800">{delivery.errorCode}</code>}
                  </dd>
                </div>
              </dl>
            </article>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto lg:block">
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
                  <Link
                    to={{ pathname: `/deliveries/${delivery.deliveryId}`, search: location.search }}
                    state={location.state}
                    className="font-medium text-app-foreground underline-offset-4 hover:text-app-brand-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
                  >
                    {delivery.externalEventId}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs text-app-foreground-faint">{shortenId(delivery.deliveryId)}</p>
                </td>
                <td className="px-4 py-3.5 text-app-foreground-secondary">{t(providerLabelKeys[delivery.provider])}</td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={delivery.status}>{t(statusLabelKeys[delivery.status])}</StatusBadge>
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-app-foreground-secondary">
                  {delivery.attemptCount}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-app-foreground-secondary">
                  {formatDateTime(delivery.receivedAt, locale)}
                </td>
                <td className="max-w-80 px-4 py-3.5">
                  {delivery.errorCode === null
                    ? <span className="text-app-foreground-faint">{t("deliveries.noError")}</span>
                    : <code className="break-all font-mono text-xs text-red-800">{delivery.errorCode}</code>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DeliveriesLoading() {
  const { t } = useTranslation();
  return <div role="status" aria-label={t("deliveries.loading")} className="space-y-3 px-4 py-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded bg-app-surface-muted" />)}</div>;
}

function DeliveriesError({ error, onRetry, onFirstPage }: { error: unknown; onRetry: () => void; onFirstPage?: () => void }) {
  const { t } = useTranslation();
  const accessFailure = operatorDeliveryAccessFailure(error);
  const requestFailure = operatorDeliveryRequestFailure(error);
  const failureKey = accessFailure ?? requestFailure;
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">{t(onFirstPage !== undefined ? "deliveries.pageRejected" : failureKey === undefined ? "deliveries.error" : failureKey === "unauthorized" || failureKey === "denied" ? `deliveries.access.${failureKey}` : `deliveries.${failureKey}`)}</p>
      {accessFailure !== undefined ? <AccessTokenButton /> : null}
      {onFirstPage !== undefined || failureKey === undefined ? (
        <button type="button" onClick={onFirstPage ?? onRetry} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
          <RefreshCw aria-hidden="true" size={16} />
          {t(onFirstPage !== undefined ? "deliveries.actions.firstPage" : "deliveries.actions.retry")}
        </button>
      ) : null}
    </div>
  );
}

function Pagination({ disabled, hasFirst, hasNext, hasPrevious, onFirst, onNext, onPrevious }: { disabled: boolean; hasFirst: boolean; hasNext: boolean; hasPrevious: boolean; onFirst: () => void; onNext: () => void; onPrevious: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex justify-end gap-1">
      {hasFirst ? <IconButton label={t("deliveries.actions.firstPage")} disabled={disabled} onClick={onFirst}><ChevronFirst aria-hidden="true" size={18} /></IconButton> : null}
      <IconButton label={t("deliveries.actions.previousPage")} disabled={disabled || !hasPrevious} onClick={onPrevious}><ChevronLeft aria-hidden="true" size={18} /></IconButton>
      <IconButton label={t("deliveries.actions.nextPage")} disabled={disabled || !hasNext} onClick={onNext}><ChevronRight aria-hidden="true" size={18} /></IconButton>
    </div>
  );
}

function shortenId(id: string): string {
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}
