import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { OperatorOrderDetail } from "../../api/integrationCoreClient";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatDuration, formatLabel, formatMoney, formatTransition } from "./orderFormatters";

const orderStatusLabelKeys = {
  RECEIVED: "orders.status.received",
  PROCESSING: "orders.status.processing",
  READY: "orders.status.ready",
} as const;

export function OrderDetailContent({ order }: { order: OperatorOrderDetail }) {
  return (
    <div className="space-y-6">
      <OrderSummary order={order} />
      <OrderItems items={order.items} currency={order.currency} />
      <OrderTimeline entries={order.timeline} />
      <ProcessingAttempts attempts={order.processingAttempts} />
    </div>
  );
}

function OrderSummary({ order }: { order: OperatorOrderDetail }) {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);
  const statusLabelKey = orderStatusLabelKeys[order.status as keyof typeof orderStatusLabelKeys];

  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-app-border bg-app-border sm:grid-cols-2 lg:grid-cols-3">
      <SummaryField label={t("orderDetail.summary.externalOrder")} value={order.externalOrderId} />
      <SummaryField label={t("orderDetail.summary.source")} value={formatLabel(order.sourceSystem)} />
      <SummaryField
        label={t("orderDetail.summary.status")}
        value={
          <StatusBadge status={order.status}>
            {statusLabelKey === undefined ? formatLabel(order.status) : t(statusLabelKey)}
          </StatusBadge>
        }
      />
      <SummaryField label={t("orderDetail.summary.total")} value={formatMoney(order.totalAmount, order.currency, locale)} />
      <SummaryField label={t("orderDetail.summary.received")} value={formatDateTime(order.receivedAt, locale)} />
      <SummaryField label={t("orderDetail.summary.items")} value={order.items.length.toString()} />
    </dl>
  );
}

function SummaryField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-app-surface px-4 py-4">
      <dt className="text-xs font-medium text-app-foreground-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-app-foreground">{value}</dd>
    </div>
  );
}

function OrderItems({ items, currency }: { items: OperatorOrderDetail["items"]; currency: string }) {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  return (
    <section aria-labelledby="order-items-heading">
      <SectionHeading id="order-items-heading" title={t("orderDetail.items.title")} count={items.length} />
      <div className="overflow-hidden rounded-md border border-app-border bg-app-surface">
        {items.length === 0 ? (
          <EmptySection>{t("orderDetail.items.empty")}</EmptySection>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="border-b border-app-border bg-app-canvas text-xs font-semibold text-app-foreground-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3">{t("orderDetail.items.columns.line")}</th>
                  <th scope="col" className="px-4 py-3">{t("orderDetail.items.columns.sku")}</th>
                  <th scope="col" className="px-4 py-3">{t("orderDetail.items.columns.description")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("orderDetail.items.columns.quantity")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("orderDetail.items.columns.unitPrice")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("orderDetail.items.columns.lineTotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-surface-muted">
                {items.map((item) => (
                  <tr key={`${item.position}-${item.sku}`}>
                    <td className="px-4 py-3.5 font-mono text-xs text-app-foreground-muted">{item.externalLineId ?? "-"}</td>
                    <td className="px-4 py-3.5 font-medium text-app-foreground">{item.sku}</td>
                    <td className="max-w-72 truncate px-4 py-3.5 text-app-foreground-secondary" title={item.description ?? undefined}>
                      {item.description ?? "-"}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatMoney(item.unitPrice, currency, locale)}</td>
                    <td className="px-4 py-3.5 text-right font-medium tabular-nums">{formatMoney(item.lineAmount, currency, locale)}</td>
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

function OrderTimeline({ entries }: { entries: OperatorOrderDetail["timeline"] }) {
  return (
    <section aria-labelledby="order-timeline-heading">
      <SectionHeading id="order-timeline-heading" title="Timeline" count={entries.length} />
      <div className="overflow-hidden rounded-md border border-app-border bg-app-surface">
        {entries.length === 0 ? (
          <EmptySection>No timeline events</EmptySection>
        ) : (
          <ol aria-label="Order timeline events" className="divide-y divide-app-surface-muted">
            {entries.map((entry) => {
              const transition = formatTransition(entry.fromStatus, entry.toStatus);

              return (
                <li key={entry.id} className="px-4 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <h3 className="text-sm font-semibold text-app-foreground">{formatLabel(entry.eventType)}</h3>
                    <time dateTime={entry.occurredAt} className="whitespace-nowrap text-xs text-app-foreground-muted">
                      {formatDateTime(entry.occurredAt)}
                    </time>
                  </div>
                  {transition !== undefined ? <p className="mt-2 text-sm font-medium text-app-foreground-strong">{transition}</p> : null}
                  {entry.message !== null ? <p className="mt-1 text-sm text-app-foreground-secondary">{entry.message}</p> : null}
                  <p className="mt-2 break-all font-mono text-xs text-app-foreground-faint">Correlation {entry.correlationId}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function ProcessingAttempts({ attempts }: { attempts: OperatorOrderDetail["processingAttempts"] }) {
  return (
    <section aria-labelledby="processing-attempts-heading">
      <SectionHeading id="processing-attempts-heading" title="Processing attempts" count={attempts.length} />
      <div className="overflow-hidden rounded-md border border-app-border bg-app-surface">
        {attempts.length === 0 ? (
          <EmptySection>No processing attempts</EmptySection>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead className="border-b border-app-border bg-app-canvas text-xs font-semibold text-app-foreground-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 text-right">Attempt</th>
                  <th scope="col" className="px-4 py-3">Trigger</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Started</th>
                  <th scope="col" className="px-4 py-3 text-right">Duration</th>
                  <th scope="col" className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-surface-muted">
                {attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="px-4 py-3.5 text-right font-medium tabular-nums">{attempt.attemptNumber}</td>
                    <td className="px-4 py-3.5 text-app-foreground-secondary">{formatLabel(attempt.trigger)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={attempt.status}>{formatLabel(attempt.status)}</StatusBadge>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-app-foreground-secondary">
                      <time dateTime={attempt.startedAt}>{formatDateTime(attempt.startedAt)}</time>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-app-foreground-secondary">
                      {formatDuration(attempt.startedAt, attempt.completedAt)}
                    </td>
                    <td className="max-w-80 px-4 py-3.5">
                      {attempt.errorCode === null ? (
                        <span className="text-app-foreground-faint">-</span>
                      ) : (
                        <>
                          <p className="font-mono text-xs font-medium text-red-800">{attempt.errorCode}</p>
                          {attempt.errorMessage !== null ? (
                            <p className="mt-1 truncate text-xs text-app-foreground-secondary" title={attempt.errorMessage}>
                              {attempt.errorMessage}
                            </p>
                          ) : null}
                        </>
                      )}
                    </td>
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

function SectionHeading({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      <span className="text-sm tabular-nums text-app-foreground-muted">{count}</span>
    </div>
  );
}

function EmptySection({ children }: { children: string }) {
  return <p className="px-6 py-10 text-center text-sm text-app-foreground-muted">{children}</p>;
}
