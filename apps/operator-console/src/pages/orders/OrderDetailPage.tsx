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
        {query.data !== undefined ? <OrderSummary order={query.data} /> : null}
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
