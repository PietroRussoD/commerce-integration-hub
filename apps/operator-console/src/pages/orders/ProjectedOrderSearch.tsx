import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, TriangleAlert } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { searchOperatorOrders, type OperatorOrderSearchPage } from "../../api/integrationCoreClient";
import { IconButton } from "../../components/ui/IconButton";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatLabel, formatMoney } from "./orderFormatters";

const SEARCH_PAGE_SIZE = 25;

export function ProjectedOrderSearch() {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const [submittedSearchText, setSubmittedSearchText] = useState<string>();
  const query = useQuery({
    queryKey: ["operator-projected-order-search", { q: submittedSearchText, limit: SEARCH_PAGE_SIZE }],
    queryFn: ({ signal }) => searchOperatorOrders({ q: submittedSearchText, limit: SEARCH_PAGE_SIZE, signal }),
    enabled: submittedSearchText !== undefined,
    placeholderData: keepPreviousData,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = searchText.trim();
    if (value.length === 0) return;

    if (value === submittedSearchText) {
      void query.refetch();
      return;
    }

    setSubmittedSearchText(value);
  }

  return (
    <section aria-labelledby="projected-order-search-heading" className="mt-5">
      <form onSubmit={submit} className="flex max-w-xl items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-app-foreground-secondary">
          <span id="projected-order-search-heading">{t("orders.search.label")}</span>
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t("orders.search.placeholder")}
            className="h-9 w-full rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none placeholder:text-app-foreground-faint focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring"
          />
        </label>
        <IconButton label={t("orders.search.submit")} type="submit" disabled={searchText.trim().length === 0 || query.isFetching}>
          <Search aria-hidden="true" size={17} />
        </IconButton>
      </form>

      {submittedSearchText === undefined ? null : (
        <div className="mt-3 overflow-hidden rounded-md border border-app-border bg-app-surface">
          {query.isPending ? <SearchLoading /> : null}
          {query.isError ? <SearchError onRetry={() => void query.refetch()} /> : null}
          {query.data !== undefined ? <SearchResults page={query.data} /> : null}
        </div>
      )}
    </section>
  );
}

function SearchLoading() {
  const { t } = useTranslation();

  return (
    <p role="status" className="px-4 py-5 text-sm text-app-foreground-secondary">
      {t("orders.search.loading")}
    </p>
  );
}

function SearchError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div role="alert" className="flex items-center gap-3 px-4 py-5 text-sm text-app-foreground-secondary">
      <TriangleAlert aria-hidden="true" size={18} className="shrink-0 text-red-700" />
      <p className="flex-1">{t("orders.search.error")}</p>
      <IconButton label={t("orders.actions.retry")} onClick={onRetry}>
        <RefreshCw aria-hidden="true" size={17} />
      </IconButton>
    </div>
  );
}

function SearchResults({ page }: { page: OperatorOrderSearchPage }) {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  if (page.items.length === 0) {
    return <p className="px-6 py-12 text-center text-sm text-app-foreground-muted">{t("orders.search.empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] border-collapse text-left text-sm">
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
            <th scope="col" className="px-4 py-3">
              {t("orders.search.table.matches")}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t("orders.table.total")}
            </th>
            <th scope="col" className="px-4 py-3">
              {t("orders.search.table.ready")}
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
              </td>
              <td className="px-4 py-3.5 text-app-foreground-secondary">{formatLabel(order.sourceSystem)}</td>
              <td className="px-4 py-3.5">
                <StatusBadge status={order.status}>{formatLabel(order.status)}</StatusBadge>
              </td>
              <td className="px-4 py-3.5 text-app-foreground-secondary">{order.itemDescriptions.join(", ")}</td>
              <td className="px-4 py-3.5 text-right font-medium tabular-nums">
                {formatMoney(order.totalAmount, order.currency, locale)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-app-foreground-secondary">
                {formatDateTime(order.readyAt, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
