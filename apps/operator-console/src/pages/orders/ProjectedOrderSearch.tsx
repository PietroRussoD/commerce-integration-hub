import { ChevronLeft, ChevronRight, RefreshCw, Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import type { OperatorOrderSearchPage } from "../../api/integrationCoreClient";
import { AccessTokenButton } from "../../auth/AccessTokenButton";
import { IconButton } from "../../components/ui/IconButton";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatLabel, formatMoney, orderStatusLabelKeys } from "./orderFormatters";
import { operatorOrderAccessFailure } from "./operatorOrderQueries";
import { normalizeOrderSearchCriteria, readOrderSearchCriteria, parsePageOffset, withPageOffset, type OrderSearchCriteria } from "./orderSearchParams";

const SEARCH_PAGE_SIZE = 25;

export function ProjectedOrderSearch({
  isAvailable,
  isAvailabilityKnown,
  isFetching,
  onRepeatSearch,
}: {
  isAvailable: boolean;
  isAvailabilityKnown: boolean;
  isFetching: boolean;
  onRepeatSearch: () => void;
}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearchText = searchParams.get("q") ?? "";
  const urlExternalOrderId = searchParams.get("externalOrderId") ?? "";
  const urlSku = searchParams.get("sku") ?? "";
  const urlCriteriaKey = JSON.stringify([urlSearchText, urlExternalOrderId, urlSku]);
  const [draft, setDraft] = useState(() => ({
    criteriaKey: urlCriteriaKey,
    searchText: urlSearchText,
    externalOrderId: urlExternalOrderId,
    sku: urlSku,
    filtersVisible: urlExternalOrderId !== "" || urlSku !== "",
  }));
  if (draft.criteriaKey !== urlCriteriaKey) {
    setDraft({
      criteriaKey: urlCriteriaKey,
      searchText: urlSearchText,
      externalOrderId: urlExternalOrderId,
      sku: urlSku,
      filtersVisible: urlExternalOrderId !== "" || urlSku !== "",
    });
  }
  const { searchText, externalOrderId, sku, filtersVisible } = draft;
  const submittedCriteria = readOrderSearchCriteria(searchParams);
  const offset = parsePageOffset(searchParams.get("searchOffset"), SEARCH_PAGE_SIZE);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const criteria = normalizeOrderSearchCriteria({ q: searchText, externalOrderId, sku });
    if (!isAvailable || isFetching || criteria === undefined) return;

    if (isSameSearchCriteria(criteria, submittedCriteria)) {
      if (offset !== 0) {
        setSearchParams((current) => withPageOffset(current, "searchOffset", 0));
        return;
      }
      onRepeatSearch();
      return;
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const name of ["q", "externalOrderId", "sku"]) next.delete(name);
      for (const [name, value] of Object.entries(criteria)) {
        if (value !== undefined) next.set(name, value);
      }
      next.delete("searchOffset");
      next.delete("offset");
      return next;
    });
  }

  function clear() {
    setDraft((current) => ({ ...current, searchText: "", externalOrderId: "", sku: "" }));
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const name of ["q", "externalOrderId", "sku", "searchOffset", "offset"]) next.delete(name);
      return next;
    });
  }

  const hasCriteria = normalizeOrderSearchCriteria({ q: searchText, externalOrderId, sku }) !== undefined;

  return (
    <section aria-labelledby="projected-order-search-heading" className="mt-5">
      <form onSubmit={submit} className="grid max-w-xl gap-3">
        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-app-foreground-secondary">
            <span id="projected-order-search-heading">{t("orders.search.label")}</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setDraft((current) => ({ ...current, searchText: event.target.value }))}
              placeholder={t("orders.search.placeholder")}
              disabled={!isAvailable}
              className="h-9 w-full rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none placeholder:text-app-foreground-faint focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring"
            />
          </label>
          <IconButton
            label={t("orders.search.filters.toggle")}
            onClick={() => setDraft((current) => ({ ...current, filtersVisible: !current.filtersVisible }))}
            aria-pressed={filtersVisible}
            disabled={!isAvailable}
          >
            <SlidersHorizontal aria-hidden="true" size={17} />
          </IconButton>
          <IconButton label={t("orders.search.submit")} type="submit" disabled={!isAvailable || !hasCriteria || isFetching}>
            <Search aria-hidden="true" size={17} />
          </IconButton>
        </div>
        {filtersVisible ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-app-foreground-secondary">
              {t("orders.search.filters.externalOrderId")}
              <input
                type="text"
                value={externalOrderId}
                onChange={(event) => setDraft((current) => ({ ...current, externalOrderId: event.target.value }))}
                disabled={!isAvailable}
                className="h-9 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-app-foreground-secondary">
              {t("orders.search.filters.sku")}
              <input
                type="text"
                value={sku}
                onChange={(event) => setDraft((current) => ({ ...current, sku: event.target.value }))}
                disabled={!isAvailable}
                className="h-9 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring"
              />
            </label>
          </div>
        ) : null}
      </form>

      {submittedCriteria !== undefined ? (
        <button
          type="button"
          onClick={clear}
          className="mt-3 rounded-sm text-sm font-medium text-app-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
        >
          {t("orders.scope.list")}
        </button>
      ) : null}

      {isAvailabilityKnown && !isAvailable ? (
        <p className="mt-2 text-sm text-app-foreground-secondary">{t("orders.search.unavailable")}</p>
      ) : null}

      {submittedCriteria !== undefined ? (
        <div className="mt-3 space-y-1 text-sm text-app-foreground-secondary">
          <p>{t("orders.search.applied", { criteria: [
            submittedCriteria.q && `${t("orders.search.textCriterion")}: ${submittedCriteria.q}`,
            submittedCriteria.externalOrderId && `${t("orders.search.filters.externalOrderId")}: ${submittedCriteria.externalOrderId}`,
            submittedCriteria.sku && `${t("orders.search.filters.sku")}: ${submittedCriteria.sku}`,
          ].filter(Boolean).join(" · ") })}</p>
          {!isSameSearchCriteria(normalizeOrderSearchCriteria({ q: searchText, externalOrderId, sku }), submittedCriteria)
            ? <p>{t("orders.search.draftChanged")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function isSameSearchCriteria(left: OrderSearchCriteria | undefined, right: OrderSearchCriteria | undefined): boolean {
  return left?.q === right?.q && left?.externalOrderId === right?.externalOrderId && left?.sku === right?.sku;
}

export function SearchLoading() {
  const { t } = useTranslation();

  return (
    <p role="status" aria-label={t("orders.search.loading")} className="px-4 py-5 text-sm text-app-foreground-secondary">
      {t("orders.search.loading")}
    </p>
  );
}

export function SearchError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const accessFailure = operatorOrderAccessFailure(error);

  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-5 text-sm text-app-foreground-secondary">
      <TriangleAlert aria-hidden="true" size={18} className="shrink-0 text-red-700" />
      <p className="flex-1">{t(accessFailure === undefined ? "orders.search.error" : `orders.access.${accessFailure}`)}</p>
      {accessFailure !== undefined ? <AccessTokenButton /> : null}
      {accessFailure === undefined ? (
        <IconButton label={t("orders.actions.retry")} onClick={onRetry}>
        <RefreshCw aria-hidden="true" size={17} />
      </IconButton>
      ) : null}
    </div>
  );
}

export function SearchResults({ page }: { page: OperatorOrderSearchPage }) {
  const { t } = useTranslation();

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
            <SearchResultRow key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SearchResultRow({ order }: { order: OperatorOrderSearchPage["items"][number] }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);
  const statusLabelKey = orderStatusLabelKeys[order.status as keyof typeof orderStatusLabelKeys];

  return (
    <tr className="group hover:bg-app-canvas">
      <td className="px-4 py-3.5">
        <Link
          to={{ pathname: `/orders/${order.id}`, search: location.search }}
          className="font-medium text-app-foreground underline-offset-4 group-hover:text-app-brand-primary group-hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
        >
          {order.externalOrderId}
        </Link>
      </td>
      <td className="px-4 py-3.5 text-app-foreground-secondary">{formatLabel(order.sourceSystem)}</td>
      <td className="px-4 py-3.5">
        <StatusBadge status={order.status}>{statusLabelKey === undefined ? formatLabel(order.status) : t(statusLabelKey)}</StatusBadge>
      </td>
      <td className="px-4 py-3.5 text-app-foreground-secondary">{order.itemDescriptions.join(", ")}</td>
      <td className="px-4 py-3.5 text-right font-medium tabular-nums">
        {formatMoney(order.totalAmount, order.currency, locale)}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-app-foreground-secondary">
        {formatDateTime(order.readyAt, locale)}
      </td>
    </tr>
  );
}

export function SearchPagination({
  page,
  onPrevious,
  onNext,
}: {
  page: OperatorOrderSearchPage;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const first = page.offset + 1;
  const last = Math.min(page.offset + page.items.length, page.total);

  return (
    <div className="flex items-center justify-end gap-3 border-t border-app-border px-4 py-3 text-sm text-app-foreground-secondary">
      <span className="tabular-nums">{t("orders.pagination", { first, last, total: page.total })}</span>
      <div className="flex gap-1">
        <IconButton label={t("orders.actions.previousPage")} onClick={onPrevious} disabled={page.offset === 0}>
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
