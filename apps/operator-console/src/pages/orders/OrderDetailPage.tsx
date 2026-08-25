import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();

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
    </section>
  );
}
