import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  getOperatorOrderSearchProjectionStatus,
  listOperatorOrders,
  type ListOperatorOrdersParameters,
  type OperatorOrderPage,
} from "../../api/integrationCoreClient";
import { IconButton } from "../../components/ui/IconButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatLabel, formatMoney } from "./orderFormatters";
import { SearchProjectionStatus } from "./SearchProjectionStatus";

const PAGE_SIZE = 25;
const statusOptions = ["ALL", "RECEIVED", "PROCESSING", "READY"] as const;
const statusLabelKeys = {
  ALL: "orders.filter.all",
  RECEIVED: "orders.status.received",
  PROCESSING: "orders.status.processing",
  READY: "orders.status.ready",
} as const;

type StatusFilter = "ALL" | NonNullable<ListOperatorOrdersParameters["status"]>;

export function OrdersPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["operator-orders", { status, offset, limit: PAGE_SIZE }],
    queryFn: ({ signal }) =>
      listOperatorOrders({
        status: status === "ALL" ? undefined : status,
        limit: PAGE_SIZE,
        offset,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
  const searchProjectionQuery = useQuery({
    queryKey: ["operator-order-search-projection-status"],
    queryFn: ({ signal }) => getOperatorOrderSearchProjectionStatus({ signal }),
  });

  async function refresh() {
    await Promise.all([query.refetch(), searchProjectionQuery.refetch()]);
  }

  return (
    <section aria-labelledby="orders-heading">
      <PageHeader
        titleId="orders-heading"
        title={t("orders.title")}
        description={query.data === undefined ? "\u00a0" : t("orders.total", { count: query.data.total })}
        actions={
          <div className="flex items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-app-foreground-secondary">
              {t("orders.filter.status")}
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as StatusFilter);
                  setOffset(0);
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
              disabled={query.isFetching || searchProjectionQuery.isFetching}
            >
              <RefreshCw
                aria-hidden="true"
                size={17}
                className={query.isFetching || searchProjectionQuery.isFetching ? "animate-spin" : undefined}
              />
            </IconButton>
          </div>
        }
      />

      <SearchProjectionStatus
        status={searchProjectionQuery.data}
        isPending={searchProjectionQuery.isPending}
        isError={searchProjectionQuery.isError}
      />

      <div className="mt-5 overflow-hidden rounded-md border border-app-border bg-app-surface">
        {query.isPending ? <OrdersLoading /> : null}
        {query.isError ? <OrdersError onRetry={() => void query.refetch()} /> : null}
        {query.data !== undefined ? <OrdersTable page={query.data} /> : null}
      </div>

      {query.data !== undefined && query.data.total > 0 ? (
        <Pagination
          page={query.data}
          onPrevious={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          onNext={() => setOffset((current) => current + PAGE_SIZE)}
        />
      ) : null}
    </section>
  );
}

function OrdersTable({ page }: { page: OperatorOrderPage }) {
  const { t, i18n } = useTranslation();
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
                  to={`/orders/${order.id}`}
                  className="font-medium text-app-foreground underline-offset-4 group-hover:text-app-brand-primary group-hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
                >
                  {order.externalOrderId}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-app-foreground-faint">{shortenId(order.id)}</p>
              </td>
              <td className="px-4 py-3.5 text-app-foreground-secondary">{formatLabel(order.sourceSystem)}</td>
              <td className="px-4 py-3.5">
                <StatusBadge status={order.status}>
                  {statusLabelKeys[order.status as keyof typeof statusLabelKeys] === undefined
                    ? formatLabel(order.status)
                    : t(statusLabelKeys[order.status as keyof typeof statusLabelKeys])}
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

function OrdersError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">{t("orders.error")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
      >
        <RefreshCw aria-hidden="true" size={16} />
        {t("orders.actions.retry")}
      </button>
    </div>
  );
}

function Pagination({
  page,
  onPrevious,
  onNext,
}: {
  page: OperatorOrderPage;
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
          disabled={page.offset === 0}
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </IconButton>
        <IconButton
          label={t("orders.actions.nextPage")}
          onClick={onNext}
          disabled={page.offset + page.items.length >= page.total}
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
