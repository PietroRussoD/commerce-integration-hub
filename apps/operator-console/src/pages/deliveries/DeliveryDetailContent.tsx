import { ExternalLink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import type { OperatorDeliveryDetail } from "../../api/connectorGatewayClient";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatDurationMilliseconds, formatLabel } from "../orders/orderFormatters";
import { jaegerTraceUrl } from "./jaegerTraceUrl";
import { isTerminalDeliveryStatus } from "./deliveryStatus";
import { useDeliveryPayloadState } from "./useDeliveryPayloadState";

const statusLabelKeys = {
  BLOCKED_CONFIGURATION: "deliveries.status.blockedConfiguration",
  DELIVERED: "deliveries.status.delivered",
  EXHAUSTED: "deliveries.status.exhausted",
  FORWARDING: "deliveries.status.forwarding",
  PERMANENT_FAILURE: "deliveries.status.permanentFailure",
  RECEIVED: "deliveries.status.received",
  RETRY_WAIT: "deliveries.status.retryWait",
  RETRYABLE_FAILURE: "deliveryDetail.attempts.outcome.retryableFailure",
} as const;

export function DeliveryDetailContent({ delivery }: { delivery: OperatorDeliveryDetail }) {
  return (
    <div className="space-y-6">
      <DeliverySummary delivery={delivery} />
      <DeliveryAttempts attempts={delivery.attempts} />
    </div>
  );
}

function DeliverySummary({ delivery }: { delivery: OperatorDeliveryDetail }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);
  const providerLabel = delivery.provider === "ERP_B" ? "deliveries.provider.erpB" : "deliveries.provider.marketplaceA";
  const payload = useDeliveryPayloadState(delivery);
  const retentionLabels = {
    available: "deliveryDetail.retention.retained",
    expired: "deliveryDetail.retention.expired",
    missing: "deliveryDetail.retention.missing",
    unknown: "deliveryDetail.retention.unknown",
  } as const;

  const coreOrderLink = delivery.lastCoreOrderId === null ? null : (
    <Link
      to={`/orders/${encodeURIComponent(delivery.lastCoreOrderId)}`}
      state={{ returnToDelivery: `${location.pathname}${location.search}` }}
      className="break-all font-mono text-sm text-app-brand-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
    >
      {delivery.lastCoreOrderId}
    </Link>
  );

  return (
    <div className="space-y-4">
      <section aria-labelledby="delivery-outcome-heading" className="rounded-md border border-app-border bg-app-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-app-foreground-muted">{t("deliveryDetail.summary.event")}</p>
            <h2 id="delivery-outcome-heading" className="mt-1 break-all text-lg font-semibold text-app-foreground">{delivery.externalEventId}</h2>
            <p className="mt-1 text-sm text-app-foreground-secondary">{t(providerLabel)} · {delivery.attemptCount} {t(delivery.attemptCount === 1 ? "deliveryDetail.summary.attemptsCountSingular" : "deliveryDetail.summary.attemptsCountPlural")}</p>
            {coreOrderLink !== null ? <p className="mt-2 text-sm text-app-foreground-secondary">{t("deliveryDetail.summary.coreOrder")}: {coreOrderLink}</p> : null}
          </div>
          <StatusBadge status={delivery.status}>{t(statusLabelKeys[delivery.status])}</StatusBadge>
        </div>
      </section>

      {delivery.errorCode !== null || delivery.safeErrorMessage !== null ? (
        <section aria-labelledby="delivery-error-heading" className="rounded-md border border-red-300 bg-red-50 p-4 sm:p-5">
          <h2 id="delivery-error-heading" className="text-sm font-semibold text-red-950">{t("deliveryDetail.summary.latestError")}</h2>
          {delivery.errorCode !== null ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all font-mono text-sm font-semibold text-red-900">{delivery.errorCode}</code>
              <CopyValueButton value={delivery.errorCode} label={t("deliveryDetail.copyErrorCode", { code: delivery.errorCode })} />
            </div>
          ) : null}
          {delivery.safeErrorMessage !== null ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-red-950">{t("deliveryDetail.summary.gatewayMessage")}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-950">{delivery.safeErrorMessage}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <details className="rounded-md border border-app-border bg-app-surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
          {t("deliveryDetail.summary.moreDetails")}
        </summary>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-md border border-app-border bg-app-border sm:grid-cols-2 lg:grid-cols-3">
          <SummaryField label={t("deliveryDetail.summary.received")} value={formatDateTime(delivery.receivedAt, locale)} />
          <SummaryField label={t("deliveryDetail.summary.updated")} value={formatDateTime(delivery.updatedAt, locale)} />
          <SummaryField label={t("deliveryDetail.summary.connectorMode")} value={t(`deliveries.connectorMode.${delivery.connectorMode}`)} />
          <SummaryField label={t("deliveryDetail.summary.connectorStatus")} value={t(`deliveries.connectorStatus.${delivery.connectorStatus}`)} />
          <SummaryField label={t("deliveryDetail.summary.mappingVersion")} value={delivery.mappingVersion} />
          <SummaryField
            label={t("deliveryDetail.summary.nextAttempt")}
            value={isTerminalDeliveryStatus(delivery.status)
              ? t("deliveryDetail.summary.noAttemptScheduled")
              : formatDateTime(delivery.nextAttemptAt, locale)}
          />
          <SummaryField
            label={t("deliveryDetail.summary.payloadRetention")}
            value={t(retentionLabels[payload], { expiresAt: payload === "available" || payload === "expired" ? formatDateTime(delivery.payloadExpiresAt, locale) : "" })}
          />
          <SummaryField label={t("deliveryDetail.summary.httpStatus")} value={delivery.lastHttpStatus?.toString() ?? "-"} />
          <SummaryField label={t("deliveryDetail.summary.correlation")} value={delivery.correlationId ?? "-"} />
        </dl>
      </details>
    </div>
  );
}

function DeliveryAttempts({ attempts }: { attempts: OperatorDeliveryDetail["attempts"] }) {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  return (
    <section aria-labelledby="delivery-attempts-heading">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="delivery-attempts-heading" className="text-lg font-semibold">
          {t("deliveryDetail.attempts.title")}
        </h2>
        <span className="text-sm tabular-nums text-app-foreground-muted">{attempts.length}</span>
      </div>
      <div className="overflow-hidden rounded-md border border-app-border bg-app-surface">
        {attempts.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-app-foreground-muted">{t("deliveryDetail.attempts.empty")}</p>
        ) : (
          <ol className="divide-y divide-app-border">
            {attempts.map((attempt) => (
              <li key={attempt.attemptId}>
                <details className="group px-4 py-3">
                  <summary className="flex cursor-pointer flex-col gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t("deliveryDetail.attempts.columns.attemptNumber", { number: attempt.attemptNumber })}</span>
                      <AttemptOutcome outcome={attempt.outcome} />
                      {attempt.errorCode !== null ? <code className="break-all font-mono text-xs text-red-800">{attempt.errorCode}</code> : null}
                    </span>
                    <time dateTime={attempt.startedAt} className="text-xs text-app-foreground-muted">{formatDateTime(attempt.startedAt, locale)}</time>
                  </summary>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <SummaryField label={t("deliveryDetail.attempts.columns.duration")} value={attempt.durationMilliseconds === null ? "-" : formatDurationMilliseconds(attempt.durationMilliseconds, locale)} />
                    <SummaryField label={t("deliveryDetail.attempts.columns.httpStatus")} value={attempt.httpStatus?.toString() ?? "-"} />
                    {attempt.completedAt !== null ? <SummaryField label={t("deliveryDetail.attempts.columns.completed")} value={formatDateTime(attempt.completedAt, locale)} /> : null}
                    {attempt.errorCode !== null ? (
                      <SummaryField label={t("deliveryDetail.summary.errorCode")} value={<div className="flex flex-wrap items-center gap-2"><code className="break-all font-mono text-xs">{attempt.errorCode}</code><CopyValueButton value={attempt.errorCode} label={t("deliveryDetail.copyErrorCode", { code: attempt.errorCode })} /></div>} />
                    ) : null}
                    {attempt.safeErrorMessage !== null ? <SummaryField label={t("deliveryDetail.summary.gatewayMessage")} value={<p className="whitespace-pre-wrap break-words font-normal">{attempt.safeErrorMessage}</p>} /> : null}
                    <SummaryField label={t("deliveryDetail.attempts.columns.trace")} value={<AttemptTrace traceId={attempt.traceId} />} />
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function AttemptTrace({ traceId }: { traceId: string | null }) {
  const { t } = useTranslation();
  const url = jaegerTraceUrl(traceId);
  if (traceId === null) return <span className="text-app-foreground-secondary">{t("deliveryDetail.attempts.traceIdUnavailable")}</span>;
  if (url === null) return <span className="text-app-foreground-secondary">{t("deliveryDetail.attempts.traceViewerUnavailable")}</span>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("deliveryDetail.attempts.openTrace", { traceId })}
      className="inline-flex items-center gap-1.5 text-app-brand-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
    >
      {traceId}
      <ExternalLink aria-hidden="true" size={14} />
    </a>
  );
}

function AttemptOutcome({ outcome }: { outcome: OperatorDeliveryDetail["attempts"][number]["outcome"] }) {
  const { t } = useTranslation();
  if (outcome === null) return <span className="text-app-foreground-faint">-</span>;

  const labelKey = statusLabelKeys[outcome];
  return <StatusBadge status={outcome}>{labelKey === undefined ? formatLabel(outcome) : t(labelKey)}</StatusBadge>;
}

function CopyValueButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copyValue()}
        className="rounded-sm text-xs font-medium text-app-brand-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
      >
        {label}
      </button>
      {copyState !== "idle" ? <span role="status" className="text-xs text-app-foreground-secondary">{t(copyState === "copied" ? "deliveryDetail.valueCopied" : "deliveryDetail.valueCopyFailed")}</span> : null}
    </span>
  );
}

function SummaryField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-app-surface px-4 py-4">
      <dt className="text-xs font-medium text-app-foreground-muted">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-app-foreground">{value}</dd>
    </div>
  );
}
