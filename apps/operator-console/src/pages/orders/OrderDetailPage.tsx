import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { getOperatorOrder } from "../../api/integrationCoreClient";
import { OrderDetailContent } from "./OrderDetailContent";

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
        {query.data !== undefined ? <OrderDetailContent order={query.data} /> : null}
      </div>
    </section>
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
