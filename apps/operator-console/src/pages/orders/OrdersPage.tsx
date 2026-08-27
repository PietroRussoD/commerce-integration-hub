import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { listOperatorOrders, type ListOperatorOrdersParameters, type OperatorOrderPage } from "../../api/integrationCoreClient";
import { IconButton } from "../../components/ui/IconButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatDateTime, formatLabel, formatMoney } from "./orderFormatters";

const PAGE_SIZE = 25;
const statusOptions = ["ALL", "RECEIVED", "PROCESSING", "READY"] as const;

type StatusFilter = "ALL" | NonNullable<ListOperatorOrdersParameters["status"]>;

export function OrdersPage() {
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

  return (
    <section aria-labelledby="orders-heading">
      <PageHeader
        titleId="orders-heading"
        title="Orders"
        description={query.data === undefined ? "\u00a0" : `${query.data.total} total`}
        actions={
          <div className="flex items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-zinc-600">
              Status
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as StatusFilter);
                  setOffset(0);
                }}
                className="h-9 min-w-36 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <IconButton label="Refresh orders" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw aria-hidden="true" size={17} className={query.isFetching ? "animate-spin" : undefined} />
            </IconButton>
          </div>
        }
      />

      <div className="mt-5 overflow-hidden rounded-md border border-zinc-200 bg-white">
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
  if (page.items.length === 0) {
    return <p className="px-6 py-16 text-center text-sm text-zinc-500">No orders found</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
          <tr>
            <th scope="col" className="px-4 py-3">
              Order
            </th>
            <th scope="col" className="px-4 py-3">
              Source
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Total
            </th>
            <th scope="col" className="px-4 py-3">
              Received
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Attempts
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {page.items.map((order) => (
            <tr key={order.id} className="group hover:bg-zinc-50">
              <td className="px-4 py-3.5">
                <Link
                  to={`/orders/${order.id}`}
                  className="font-medium text-zinc-950 underline-offset-4 group-hover:text-emerald-800 group-hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                >
                  {order.externalOrderId}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-zinc-400">{shortenId(order.id)}</p>
              </td>
              <td className="px-4 py-3.5 text-zinc-600">{formatLabel(order.sourceSystem)}</td>
              <td className="px-4 py-3.5">
                <StatusBadge status={order.status}>{formatLabel(order.status)}</StatusBadge>
              </td>
              <td className="px-4 py-3.5 text-right font-medium tabular-nums">{formatMoney(order.totalAmount, order.currency)}</td>
              <td className="px-4 py-3.5 whitespace-nowrap text-zinc-600">{formatDateTime(order.receivedAt)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-zinc-600">{order.processingAttempts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersLoading() {
  return (
    <div role="status" aria-label="Loading orders" className="space-y-3 px-4 py-5">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-12 animate-pulse rounded bg-zinc-100" />
      ))}
    </div>
  );
}

function OrdersError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">Unable to load orders</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium hover:bg-zinc-50"
      >
        <RefreshCw aria-hidden="true" size={16} />
        Retry
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
  const first = page.offset + 1;
  const last = Math.min(page.offset + page.items.length, page.total);

  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-sm text-zinc-600">
      <span className="tabular-nums">
        {first}-{last} of {page.total}
      </span>
      <div className="flex gap-1">
        <IconButton
          label="Previous page"
          onClick={onPrevious}
          disabled={page.offset === 0}
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </IconButton>
        <IconButton
          label="Next page"
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
