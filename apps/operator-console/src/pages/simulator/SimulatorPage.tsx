import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Send, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import {
  IntegrationCoreApiError,
  receiveOrder,
  type ReceiveOrderParameters,
  type ReceiveOrderRequest,
  type ReceiveOrderResult,
} from "../../api/integrationCoreClient";

const inputClassName =
  "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";
const amountPattern = "(?:0|[1-9][0-9]{0,16})(?:\\.[0-9]{1,2})?";
const quantityPattern = "(?:0|[1-9][0-9]{0,14})(?:\\.[0-9]{1,4})?";

export function SimulatorPage() {
  const [sourceApiKey, setSourceApiKey] = useState("");
  const [externalId, setExternalId] = useState("DEMO-ORDER-001");
  const [currency, setCurrency] = useState<ReceiveOrderRequest["currency"]>("EUR");
  const [declaredTotalAmount, setDeclaredTotalAmount] = useState("39.98");
  const [sku, setSku] = useState("DEMO-SKU-001");
  const [quantity, setQuantity] = useState("2");
  const [unitPrice, setUnitPrice] = useState("19.99");
  const mutation = useMutation({ mutationFn: (parameters: ReceiveOrderParameters) => receiveOrder(parameters) });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({
      sourceApiKey,
      request: {
        externalId,
        currency,
        declaredTotalAmount,
        items: [{ sku, quantity, unitPrice }],
      },
    });
  }

  return (
    <section aria-labelledby="simulator-heading">
      <div className="border-b border-zinc-200 pb-5">
        <h1 id="simulator-heading" className="text-2xl font-semibold">
          Simulator
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-7">
        <fieldset className="grid gap-4 border-0 p-0 sm:grid-cols-2">
          <legend className="mb-3 text-lg font-semibold">Source authentication</legend>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-700 sm:col-span-2">
            Source API key
            <input
              type="password"
              value={sourceApiKey}
              onChange={(event) => setSourceApiKey(event.target.value)}
              autoComplete="off"
              required
              className={inputClassName}
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-4 border-0 border-t border-zinc-200 p-0 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="mb-3 text-lg font-semibold">Order</legend>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
            External order ID
            <input
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              maxLength={128}
              required
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
            Currency
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as ReceiveOrderRequest["currency"])}
              className={inputClassName}
            >
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
            Declared total
            <input
              value={declaredTotalAmount}
              onChange={(event) => setDeclaredTotalAmount(event.target.value)}
              inputMode="decimal"
              pattern={amountPattern}
              required
              className={inputClassName}
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-4 border-0 border-t border-zinc-200 p-0 pt-6 sm:grid-cols-3">
          <legend className="mb-3 text-lg font-semibold">Order item</legend>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
            SKU
            <input
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              maxLength={100}
              required
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
            Quantity
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="decimal"
              pattern={quantityPattern}
              required
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
            Unit price
            <input
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              inputMode="decimal"
              pattern={quantityPattern}
              required
              className={inputClassName}
            />
          </label>
        </fieldset>

        <div className="flex justify-end border-t border-zinc-200 pt-5">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send aria-hidden="true" size={17} />
            {mutation.isPending ? "Submitting..." : "Submit order"}
          </button>
        </div>
      </form>

      {mutation.isSuccess ? <SimulationSuccess result={mutation.data} /> : null}
      {mutation.isError ? <SimulationError error={mutation.error} /> : null}
    </section>
  );
}

function SimulationSuccess({ result }: { result: ReceiveOrderResult }) {
  const title = result.outcome === "CREATED" ? "Order created" : "Equivalent order replayed";

  return (
    <div role="status" className="mt-6 border-t border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-950">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 break-all font-mono text-xs text-emerald-800">{result.order.id}</p>
          <Link to={`/orders/${result.order.id}`} className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">
            View order
          </Link>
        </div>
      </div>
    </div>
  );
}

function SimulationError({ error }: { error: Error }) {
  const fieldErrors = error instanceof IntegrationCoreApiError ? error.problem?.errors : undefined;

  return (
    <div role="alert" className="mt-6 border-t border-red-200 bg-red-50 px-4 py-4 text-red-950">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-red-700" />
        <div>
          <p className="font-semibold">Order submission failed</p>
          <p className="mt-1 text-sm">{error.message}</p>
          {fieldErrors !== undefined && fieldErrors.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {fieldErrors.map((fieldError) => (
                <li key={`${fieldError.field}-${fieldError.message}`}>
                  <span className="font-mono text-xs">{fieldError.field}</span>: {fieldError.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
