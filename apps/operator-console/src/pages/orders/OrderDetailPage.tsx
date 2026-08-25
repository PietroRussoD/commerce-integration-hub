import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { getOperatorOrder, type OperatorOrderDetail } from "../../api/integrationCoreClient";

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function OrderDetailPage() {
  const orderId = useParams<{ orderId: string }>().orderId ?? "";
  const query = useQuery({
    queryKey: ["operator-order", orderId],
    queryFn: ({ signal }) => getOperatorOrder({ orderId, signal }),
    enabled: orderId.length > 0,
  });

  return (
    <section aria-labelledby="order-detail-heading">
      <Link to="/orders" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-950">
        <ArrowLeft aria-hidden="true" size={16} />
        Orders
      </Link>

      <div className="mt-5 border-b border-zinc-200 pb-5">
        <h1 id="order-detail-heading" className="text-2xl font-semibold">
          Order details
        </h1>
        <p className="mt-2 break-all font-mono text-xs text-zinc-500">{orderId}</p>
      </div>

      <div className="mt-5">
        {query.isPending ? <OrderDetailLoading /> : null}
        {query.isError ? <OrderDetailError onRetry={() => void query.refetch()} /> : null}
        {query.data !== undefined ? (
          <div className="space-y-6">
            <OrderSummary order={query.data} />
            <OrderItems items={query.data.items} currency={query.data.currency} />
            <OrderTimeline entries={query.data.timeline} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OrderTimeline({ entries }: { entries: OperatorOrderDetail["timeline"] }) {
  return (
    <section aria-labelledby="order-timeline-heading">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="order-timeline-heading" className="text-lg font-semibold">
          Timeline
        </h2>
        <span className="text-sm tabular-nums text-zinc-500">{entries.length}</span>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        {entries.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">No timeline events</p>
        ) : (
          <ol aria-label="Order timeline events" className="divide-y divide-zinc-100">
            {entries.map((entry) => {
              const transition = formatTransition(entry.fromStatus, entry.toStatus);

              return (
                <li key={entry.id} className="px-4 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <h3 className="text-sm font-semibold text-zinc-950">{formatLabel(entry.eventType)}</h3>
                    <time dateTime={entry.occurredAt} className="whitespace-nowrap text-xs text-zinc-500">
                      {dateTimeFormatter.format(new Date(entry.occurredAt))}
                    </time>
                  </div>
                  {transition !== undefined ? <p className="mt-2 text-sm font-medium text-zinc-700">{transition}</p> : null}
                  {entry.message !== null ? <p className="mt-1 text-sm text-zinc-600">{entry.message}</p> : null}
                  <p className="mt-2 break-all font-mono text-xs text-zinc-400">Correlation {entry.correlationId}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function OrderItems({ items, currency }: { items: OperatorOrderDetail["items"]; currency: string }) {
  return (
    <section aria-labelledby="order-items-heading">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="order-items-heading" className="text-lg font-semibold">
          Order items
        </h2>
        <span className="text-sm tabular-nums text-zinc-500">{items.length}</span>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        {items.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">No order items</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Line
                  </th>
                  <th scope="col" className="px-4 py-3">
                    SKU
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Description
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Quantity
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Unit price
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Line total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((item) => (
                  <tr key={`${item.position}-${item.sku}`}>
                    <td className="px-4 py-3.5 font-mono text-xs text-zinc-500">{item.externalLineId ?? "-"}</td>
                    <td className="px-4 py-3.5 font-medium text-zinc-950">{item.sku}</td>
                    <td className="max-w-72 truncate px-4 py-3.5 text-zinc-600" title={item.description ?? undefined}>
                      {item.description ?? "-"}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatMoney(item.unitPrice, currency)}</td>
                    <td className="px-4 py-3.5 text-right font-medium tabular-nums">{formatMoney(item.lineAmount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function OrderSummary({ order }: { order: OperatorOrderDetail }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryField label="External order" value={order.externalOrderId} />
      <SummaryField label="Source" value={formatLabel(order.sourceSystem)} />
      <SummaryField label="Status" value={formatLabel(order.status)} />
      <SummaryField label="Total" value={formatMoney(order.totalAmount, order.currency)} />
      <SummaryField label="Received" value={dateTimeFormatter.format(new Date(order.receivedAt))} />
      <SummaryField label="Items" value={order.items.length.toString()} />
    </dl>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-zinc-950">{value}</dd>
    </div>
  );
}

function OrderDetailLoading() {
  return (
    <div role="status" aria-label="Loading order details" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-md bg-zinc-100" />
      ))}
    </div>
  );
}

function OrderDetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-md border border-zinc-200 bg-white px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" size={24} className="text-red-700" />
      <p className="mt-3 font-medium">Unable to load order details</p>
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

function formatTransition(fromStatus: string | null, toStatus: string | null): string | undefined {
  if (fromStatus !== null && toStatus !== null) {
    return `${formatLabel(fromStatus)} to ${formatLabel(toStatus)}`;
  }
  if (toStatus !== null) {
    return `Entered ${formatLabel(toStatus)}`;
  }
  if (fromStatus !== null) {
    return `Left ${formatLabel(fromStatus)}`;
  }
  return undefined;
}
