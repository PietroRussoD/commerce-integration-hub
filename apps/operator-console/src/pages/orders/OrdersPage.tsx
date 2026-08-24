import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { listOperatorOrders, type ListOperatorOrdersParameters, type OperatorOrderPage } from "../../api/integrationCoreClient";

const PAGE_SIZE = 25;
const statusOptions = ["ALL", "RECEIVED", "PROCESSING", "READY"] as const;

type StatusFilter = "ALL" | NonNullable<ListOperatorOrdersParameters["status"]>;

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

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
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 id="orders-heading" className="text-2xl font-semibold">
            Orders
          </h1>
          <p className="mt-1 min-h-5 text-sm text-zinc-500">{query.data === undefined ? "\u00a0" : `${query.data.total} total`}</p>
        </div>

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

          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh orders"
            title="Refresh orders"
            className="grid size-9 place-items-center rounded-md border border-zinc-300 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" size={17} className={query.isFetching ? "animate-spin" : undefined} />
          </button>
        </div>
      </div>

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
            <tr key={order.id} className="hover:bg-zinc-50">
              <td className="px-4 py-3.5">
                <p className="font-medium text-zinc-950">{order.externalOrderId}</p>
                <p className="mt-0.5 font-mono text-xs text-zinc-400">{shortenId(order.id)}</p>
              </td>
              <td className="px-4 py-3.5 text-zinc-600">{formatLabel(order.sourceSystem)}</td>
              <td className="px-4 py-3.5">
                <StatusBadge status={order.status} />
              </td>
              <td className="px-4 py-3.5 text-right font-medium tabular-nums">{formatMoney(order.totalAmount, order.currency)}</td>
              <td className="px-4 py-3.5 whitespace-nowrap text-zinc-600">{dateTimeFormatter.format(new Date(order.receivedAt))}</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-zinc-600">{order.processingAttempts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors =
    {
      RECEIVED: "bg-sky-50 text-sky-800 ring-sky-600/20",
      PROCESSING: "bg-amber-50 text-amber-800 ring-amber-600/20",
      READY: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
    }[status] ?? "bg-zinc-100 text-zinc-700 ring-zinc-500/20";

  return <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${colors}`}>{formatLabel(status)}</span>;
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
        <button
          type="button"
          onClick={onPrevious}
          disabled={page.offset === 0}
          aria-label="Previous page"
          title="Previous page"
          className="grid size-9 place-items-center rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page.offset + page.items.length >= page.total}
          aria-label="Next page"
          title="Next page"
          className="grid size-9 place-items-center rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(amount));
}

function shortenId(id: string): string {
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}
