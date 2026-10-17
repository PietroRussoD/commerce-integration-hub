import { type TFunction } from "i18next";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OperatorOrderDetail } from "../../api/integrationCoreClient";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatDuration, formatLabel, formatMoney, formatPreciseDateTime, formatQuantity } from "./orderFormatters";

const orderStatusLabelKeys = {
  RECEIVED: "orders.status.received",
  PROCESSING: "orders.status.processing",
  READY: "orders.status.ready",
} as const;
const timelineEventLabelKeys = {
  ORDER_RECEIVED: "orderDetail.timeline.events.orderReceived",
  PROCESSING_STARTED: "orderDetail.timeline.events.processingStarted",
  PROCESSING_SUCCEEDED: "orderDetail.timeline.events.processingSucceeded",
  PROCESSING_FAILED: "orderDetail.timeline.events.processingFailed",
  RETRY_REQUESTED: "orderDetail.timeline.events.retryRequested",
} as const;
const attemptStatusLabelKeys = {
  STARTED: "orderDetail.attempts.status.started",
  SUCCEEDED: "orderDetail.attempts.status.succeeded",
  FAILED: "orderDetail.attempts.status.failed",
} as const;
const attemptTriggerLabelKeys = {
  INITIAL: "orderDetail.attempts.trigger.initial",
  AUTOMATIC_RETRY: "orderDetail.attempts.trigger.automaticRetry",
  MANUAL_RETRY: "orderDetail.attempts.trigger.manualRetry",
} as const;
type KnownLabelKey =
  | (typeof orderStatusLabelKeys)[keyof typeof orderStatusLabelKeys]
  | (typeof timelineEventLabelKeys)[keyof typeof timelineEventLabelKeys]
  | (typeof attemptStatusLabelKeys)[keyof typeof attemptStatusLabelKeys]
  | (typeof attemptTriggerLabelKeys)[keyof typeof attemptTriggerLabelKeys];

export function OrderDetailContent({ order }: { order: OperatorOrderDetail }) {
  return (
    <div className="space-y-6">
      <OrderSummary order={order} />
      <OrderItems items={order.items} currency={order.currency} />
      <OrderTimeline entries={order.timeline} />
      <ProcessingAttempts attempts={order.processingAttempts} />
      <TechnicalDetails order={order} />
    </div>
  );
}

function OrderSummary({ order }: { order: OperatorOrderDetail }) {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);
  const statusLabelKey = orderStatusLabelKeys[order.status as keyof typeof orderStatusLabelKeys];

  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-app-border bg-app-border sm:grid-cols-2 lg:grid-cols-3">
      <SummaryField label={t("orderDetail.summary.source")} value={formatLabel(order.sourceSystem)} />
      <SummaryField
        label={t("orderDetail.summary.status")}
        value={
          <div className="space-y-1.5">
            <StatusBadge status={order.status}>
              {statusLabelKey === undefined ? formatLabel(order.status) : t(statusLabelKey)}
            </StatusBadge>
            <p className="text-xs font-normal text-app-foreground-secondary">
              {t(`orderDetail.statusDescription.${order.status}`, { defaultValue: t("orderDetail.statusDescription.unknown") })}
            </p>
          </div>
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
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatQuantity(item.quantity, locale)}</td>
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
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  return (
    <section aria-labelledby="order-timeline-heading">
      <SectionHeading id="order-timeline-heading" title={t("orderDetail.timeline.title")} count={entries.length} />
      <div className="overflow-hidden rounded-md border border-app-border bg-app-surface">
        {entries.length === 0 ? (
          <EmptySection>{t("orderDetail.timeline.empty")}</EmptySection>
        ) : (
          <ol aria-label={t("orderDetail.timeline.ariaLabel")} className="divide-y divide-app-surface-muted">
            {entries.map((entry) => {
              const transition = translateTransition(entry.fromStatus, entry.toStatus, t);

              return (
                <li key={entry.id} className="px-4 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <h3 className="text-sm font-semibold text-app-foreground">
                      {translateKnownLabel(entry.eventType, timelineEventLabelKeys, t)}
                    </h3>
                    <TimelineTimestamp value={entry.occurredAt} locale={locale} />
                  </div>
                  {transition !== undefined ? <p className="mt-2 text-sm font-medium text-app-foreground-strong">{transition}</p> : null}
                  {entry.message !== null ? <p className="mt-1 text-sm text-app-foreground-secondary">{entry.message}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function TimelineTimestamp({ value, locale }: { value: string; locale: string }) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyTimestamp() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <time dateTime={value} className="text-xs tabular-nums text-app-foreground-muted">
        {formatPreciseDateTime(value, locale)}
      </time>
      <details className="text-xs text-app-foreground-secondary">
        <summary className="cursor-pointer focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
          {t("orderDetail.timeline.timestampDetails")}
        </summary>
        <div className="mt-1 flex flex-wrap items-center gap-2 sm:justify-end">
          <code className="select-all break-all font-mono">{value}</code>
          <button
            type="button"
            onClick={() => void copyTimestamp()}
            className="underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
          >
            {t("orderDetail.timeline.copyTimestamp")}
          </button>
        </div>
        {copyState !== "idle" ? (
          <p role="status" className="mt-1">
            {t(copyState === "copied" ? "orderDetail.timeline.timestampCopied" : "orderDetail.timeline.timestampCopyFailed")}
          </p>
        ) : null}
      </details>
    </div>
  );
}

function ProcessingAttempts({ attempts }: { attempts: OperatorOrderDetail["processingAttempts"] }) {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  return (
    <section aria-labelledby="processing-attempts-heading">
      <SectionHeading id="processing-attempts-heading" title={t("orderDetail.attempts.title")} count={attempts.length} />
      <p className="mb-3 text-sm text-app-foreground-secondary">{t("orderDetail.attempts.description")}</p>
      <div className="overflow-hidden rounded-md border border-app-border bg-app-surface">
        {attempts.length === 0 ? (
          <EmptySection>{t("orderDetail.attempts.empty")}</EmptySection>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead className="border-b border-app-border bg-app-canvas text-xs font-semibold text-app-foreground-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 text-right">{t("orderDetail.attempts.columns.attempt")}</th>
                  <th scope="col" className="px-4 py-3">{t("orderDetail.attempts.columns.trigger")}</th>
                  <th scope="col" className="px-4 py-3">{t("orderDetail.attempts.columns.status")}</th>
                  <th scope="col" className="px-4 py-3">{t("orderDetail.attempts.columns.started")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("orderDetail.attempts.columns.duration")}</th>
                  <th scope="col" className="px-4 py-3">{t("orderDetail.attempts.columns.error")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-surface-muted">
                {attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="px-4 py-3.5 text-right font-medium tabular-nums">{attempt.attemptNumber}</td>
                    <td className="px-4 py-3.5 text-app-foreground-secondary">
                      {translateKnownLabel(attempt.trigger, attemptTriggerLabelKeys, t)}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={attempt.status}>
                        {translateKnownLabel(attempt.status, attemptStatusLabelKeys, t)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-app-foreground-secondary">
                      <time dateTime={attempt.startedAt}>{formatDateTime(attempt.startedAt, locale)}</time>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-app-foreground-secondary">
                      {formatDuration(attempt.startedAt, attempt.completedAt, locale, t("orderDetail.attempts.inProgress"))}
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

function TechnicalDetails({ order }: { order: OperatorOrderDetail }) {
  const { t } = useTranslation();
  const correlations = [...new Set(order.timeline.map((entry) => entry.correlationId))];

  return (
    <details className="rounded-md border border-app-border bg-app-surface px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
        {t("orderDetail.technical.title")}
      </summary>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-app-foreground-muted">{t("orderDetail.technical.orderId")}</dt>
          <dd className="mt-1 break-all font-mono text-xs text-app-foreground-secondary">{order.id}</dd>
        </div>
        {correlations.map((correlationId) => (
          <div key={correlationId}>
            <dt className="text-xs font-medium text-app-foreground-muted">{t("orderDetail.technical.correlationId")}</dt>
            <dd className="mt-1 break-all font-mono text-xs text-app-foreground-secondary">{correlationId}</dd>
          </div>
        ))}
      </dl>
    </details>
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

function translateKnownLabel(
  value: string,
  keys: Readonly<Record<string, KnownLabelKey>>,
  t: TFunction,
): string {
  const key = keys[value];
  return key === undefined ? formatLabel(value) : t(key);
}

function translateTransition(fromStatus: string | null, toStatus: string | null, t: TFunction): string | undefined {
  if (fromStatus !== null && toStatus !== null) {
    return t("orderDetail.timeline.transition.between", {
      from: translateKnownLabel(fromStatus, orderStatusLabelKeys, t),
      to: translateKnownLabel(toStatus, orderStatusLabelKeys, t),
    });
  }
  if (toStatus !== null) {
    return t("orderDetail.timeline.transition.entered", {
      status: translateKnownLabel(toStatus, orderStatusLabelKeys, t),
    });
  }
  if (fromStatus !== null) {
    return t("orderDetail.timeline.transition.left", {
      status: translateKnownLabel(fromStatus, orderStatusLabelKeys, t),
    });
  }
  return undefined;
}
