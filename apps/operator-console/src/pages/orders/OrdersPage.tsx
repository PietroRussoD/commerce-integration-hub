import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import {
  getOperatorOrderSearchProjectionStatus,
  listOperatorOrders,
  searchOperatorOrders,
  type ListOperatorOrdersParameters,
  type OperatorOrderPage,
} from "../../api/integrationCoreClient";
import { AccessTokenButton } from "../../auth/AccessTokenButton";
import { useAccessToken } from "../../auth/accessTokenContext";
import { IconButton } from "../../components/ui/IconButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatLabel, formatMoney, orderStatusLabelKeys } from "./orderFormatters";
import { SearchProjectionStatus } from "./SearchProjectionStatus";
import { ProjectedOrderSearch, SearchError, SearchLoading, SearchPagination, SearchResults } from "./ProjectedOrderSearch";
import { getSearchProjectionStatusRefetchInterval } from "./searchProjectionPolling";
import { operatorOrderAccessFailure, retryOperatorOrderQuery } from "./operatorOrderQueries";
import { parsePageOffset, withPageOffset, readOrderSearchCriteria } from "./orderSearchParams";

const PAGE_SIZE = 25;
const statusOptions = ["ALL", "RECEIVED", "PROCESSING", "READY"] as const;
const statusLabelKeys = {
  ALL: "orders.filter.all",
  ...orderStatusLabelKeys,
} as const;

type StatusFilter = "ALL" | NonNullable<ListOperatorOrdersParameters["status"]>;

export function OrdersPage() {
  const { t } = useTranslation();
  const { accessToken, cacheScope } = useAccessToken();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const offset = parsePageOffset(searchParams.get("offset"), PAGE_SIZE);
  const criteria = readOrderSearchCriteria(searchParams);
  const isSearch = criteria !== undefined;
  const searchOffset = parsePageOffset(searchParams.get("searchOffset"), PAGE_SIZE);
  const query = useQuery({
    queryKey: ["operator-orders", cacheScope, { status, offset, limit: PAGE_SIZE }],
    queryFn: ({ signal }) =>
      listOperatorOrders({
        accessToken,
        status: status === "ALL" ? undefined : status,
        limit: PAGE_SIZE,
        offset,
        signal,
      }),
    enabled: !isSearch,
    retry: retryOperatorOrderQuery,
  });
  const searchProjectionQuery = useQuery({
    queryKey: ["operator-order-search-projection-status", cacheScope],
    queryFn: ({ signal }) => getOperatorOrderSearchProjectionStatus({ accessToken, signal }),
    retry: retryOperatorOrderQuery,
    refetchInterval: (query) => operatorOrderAccessFailure(query.state.error) === undefined
      ? getSearchProjectionStatusRefetchInterval(query.state.data)
      : false,
  });

  const isSearchAvailable = !searchProjectionQuery.isError && searchProjectionQuery.data?.availability === "AVAILABLE";
  const searchQuery = useQuery({
    queryKey: ["operator-projected-order-search", cacheScope, { ...criteria, status, limit: PAGE_SIZE, offset: searchOffset }],
    queryFn: ({ signal }) => searchOperatorOrders({
      accessToken, ...criteria, status: status === "ALL" ? undefined : status,
      limit: PAGE_SIZE, offset: searchOffset, signal,
    }),
    enabled: isSearch && isSearchAvailable,
    // Re-enabling search after an index outage must reread its current results.
    staleTime: 0,
    retry: retryOperatorOrderQuery,
  });
  const activeQuery = isSearch ? searchQuery : query;
  const activePage = isSearch && !isSearchAvailable || operatorOrderAccessFailure(activeQuery.error) !== undefined
    ? undefined
    : activeQuery.data;
  const isRefreshing = activeQuery.isFetching || searchProjectionQuery.isFetching;
  const pageAnnouncement = activeQuery.isFetching || activePage === undefined
    ? ""
    : activePage.items.length === 0
      ? t("orders.resultsAnnouncementEmpty", { message: t(isSearch ? "orders.search.empty" : "orders.empty") })
      : t("orders.resultsAnnouncement", { range: t("orders.pagination", {
          first: activePage.offset + 1,
          last: Math.min(activePage.offset + activePage.items.length, activePage.total),
          total: activePage.total,
        }) });

  async function refresh() {
    await Promise.all([
      searchProjectionQuery.refetch(),
      !isSearch ? query.refetch() : isSearchAvailable ? searchQuery.refetch() : undefined,
    ]);
  }

  return (
    <section aria-labelledby="orders-heading">
      <PageHeader
        titleId="orders-heading"
        title={t("orders.title")}
        description={`${t(isSearch ? "orders.scope.search" : "orders.scope.list")}${activePage === undefined ? "" : ` · ${t("orders.total", { count: activePage.total })}`}`}
        actions={
          <div className="flex items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-app-foreground-secondary">
              {t("orders.filter.status")}
              <select
                value={status}
                onChange={(event) => {
                  const nextStatus = event.target.value as StatusFilter;
                  setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    if (nextStatus === "ALL") next.delete("status");
                    else next.set("status", nextStatus);
                    next.delete("offset");
                    next.delete("searchOffset");
                    return next;
                  });
                }}
                className="h-9 min-w-36 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(statusLabelKeys[option])}
                  </option>
                ))}
              </select>
            </label>

            <IconButton
              label={t("orders.actions.refresh")}
              onClick={() => void refresh()}
              disabled={isRefreshing}
            >
              <RefreshCw
                aria-hidden="true"
                size={17}
                className={isRefreshing ? "animate-spin" : undefined}
              />
            </IconButton>
          </div>
        }
      />
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{pageAnnouncement}</p>

      <SearchProjectionStatus
        status={searchProjectionQuery.data}
        isPending={searchProjectionQuery.isPending}
        isError={searchProjectionQuery.isError}
        error={searchProjectionQuery.error}
      />

      <ProjectedOrderSearch
        isAvailable={isSearchAvailable}
        isAvailabilityKnown={!searchProjectionQuery.isPending}
        isFetching={searchQuery.isFetching}
        onRepeatSearch={() => void searchQuery.refetch()}
      />

      {isSearch ? (
        <>
          <p className="mt-3 text-sm text-app-foreground-secondary">{t("orders.search.scopeGuidance")}</p>
          {searchProjectionQuery.isPending ? <SearchLoading /> : null}
          {isSearchAvailable ? (
            <div aria-busy={searchQuery.isFetching} className="mt-5 overflow-hidden rounded-md border border-app-border bg-app-surface">
              {searchQuery.isPending ? <SearchLoading /> : null}
              {searchQuery.isFetching && searchQuery.data !== undefined
                ? <p role="status" className="px-4 py-2 text-sm text-app-foreground-secondary">{t("orders.search.updating")}</p>
                : null}
              {searchQuery.isError ? <SearchError error={searchQuery.error} onRetry={() => void searchQuery.refetch()} /> : null}
              {searchQuery.data !== undefined && operatorOrderAccessFailure(searchQuery.error) === undefined ? (
                <>
                  <SearchResults page={searchQuery.data} />
                  {searchQuery.data.total > 0 ? <SearchPagination
                    page={searchQuery.data}
                    isBusy={searchQuery.isFetching}
                    onPrevious={() => setSearchParams((current) => withPageOffset(current, "searchOffset", Math.max(0, searchOffset - PAGE_SIZE)))}
                    onNext={() => setSearchParams((current) => withPageOffset(current, "searchOffset", searchOffset + PAGE_SIZE))}
                  /> : null}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div aria-busy={query.isFetching} className="mt-5 overflow-hidden rounded-md border border-app-border bg-app-surface">
            {query.isPending ? <OrdersLoading /> : null}
            {query.isFetching && query.data !== undefined ? <OrdersUpdating /> : null}
            {query.isError ? <OrdersError error={query.error} onRetry={() => void query.refetch()} /> : null}
            {query.data !== undefined && operatorOrderAccessFailure(query.error) === undefined ? <OrdersTable page={query.data} /> : null}
          </div>

          {query.data !== undefined && operatorOrderAccessFailure(query.error) === undefined && query.data.total > 0 ? (
            <Pagination
              page={query.data}
              isBusy={query.isFetching}
              onPrevious={() => setSearchParams((current) => withPageOffset(current, "offset", Math.max(0, offset - PAGE_SIZE)))}
              onNext={() => setSearchParams((current) => withPageOffset(current, "offset", offset + PAGE_SIZE))}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function OrdersTable({ page }: { page: OperatorOrderPage }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  if (page.items.length === 0) {
    return <p className="px-6 py-16 text-center text-sm text-app-foreground-muted">{t("orders.empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-left text-sm">
        <thead className="border-b border-app-border bg-app-canvas text-xs font-semibold text-app-foreground-secondary">
          <tr>
            <th scope="col" className="px-4 py-3">
              {t("orders.table.order")}
            </th>
            <th scope="col" className="px-4 py-3">
              {t("orders.table.source")}
            </th>
            <th scope="col" className="px-4 py-3">
              {t("orders.table.status")}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t("orders.table.total")}
            </th>
            <th scope="col" className="px-4 py-3">
              {t("orders.table.received")}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t("orders.table.attempts")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-app-surface-muted">
          {page.items.map((order) => (
            <tr key={order.id} className="group hover:bg-app-canvas">
              <td className="px-4 py-3.5">
                <Link
                  to={{ pathname: `/orders/${order.id}`, search: location.search }}
                  className="font-medium text-app-foreground underline-offset-4 group-hover:text-app-brand-primary group-hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
                >
                  {order.externalOrderId}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-app-foreground-muted">{shortenId(order.id)}</p>
              </td>
              <td className="px-4 py-3.5 text-app-foreground-secondary">{formatLabel(order.sourceSystem)}</td>
              <td className="px-4 py-3.5">
                <StatusBadge status={order.status}>
                  {orderStatusLabelKeys[order.status as keyof typeof orderStatusLabelKeys] === undefined
                    ? formatLabel(order.status)
                    : t(orderStatusLabelKeys[order.status as keyof typeof orderStatusLabelKeys])}
                </StatusBadge>
              </td>
              <td className="px-4 py-3.5 text-right font-medium tabular-nums">
                {formatMoney(order.totalAmount, order.currency, locale)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-app-foreground-secondary">
                {formatDateTime(order.receivedAt, locale)}
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums text-app-foreground-secondary">{order.processingAttempts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersLoading() {
  const { t } = useTranslation();

  return (
    <div role="status" aria-label={t("orders.loading")} className="space-y-3 px-4 py-5">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-12 animate-pulse rounded bg-app-surface-muted" />
      ))}
    </div>
  );
}

function OrdersUpdating() {
  const { t } = useTranslation();

  return <p role="status" className="px-4 py-2 text-sm text-app-foreground-secondary">{t("orders.updating")}</p>;
}

function OrdersError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const accessFailure = operatorOrderAccessFailure(error);

  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">{t(accessFailure === undefined ? "orders.error" : `orders.access.${accessFailure}`)}</p>
      {accessFailure !== undefined ? <AccessTokenButton /> : null}
      {accessFailure === undefined ? (
        <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
      >
        <RefreshCw aria-hidden="true" size={16} />
        {t("orders.actions.retry")}
      </button>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  isBusy,
  onPrevious,
  onNext,
}: {
  page: OperatorOrderPage;
  isBusy: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const first = page.offset + 1;
  const last = Math.min(page.offset + page.items.length, page.total);

  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-sm text-app-foreground-secondary">
      <span className="tabular-nums">
        {t("orders.pagination", { first, last, total: page.total })}
      </span>
      <div className="flex gap-1">
        <IconButton
          label={t("orders.actions.previousPage")}
          onClick={onPrevious}
          disabled={isBusy || page.offset === 0}
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </IconButton>
        <IconButton
          label={t("orders.actions.nextPage")}
          onClick={onNext}
          disabled={isBusy || page.offset + page.items.length >= page.total}
        >
          <ChevronRight aria-hidden="true" size={18} />
        </IconButton>
      </div>
    </div>
  );
}

function shortenId(id: string): string {
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function parseStatus(value: string | null): StatusFilter {
  return value !== null && statusOptions.includes(value as StatusFilter) ? value as StatusFilter : "ALL";
}
