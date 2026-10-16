import { ExternalLink } from "lucide-react";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { OperatorDeliveryDetail } from "../../api/connectorGatewayClient";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime, formatDurationMilliseconds, formatLabel } from "../orders/orderFormatters";
import { jaegerTraceUrl } from "./jaegerTraceUrl";
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
  const locale = resolveIntlLocale(i18n.resolvedLanguage);
  const providerLabel = delivery.provider === "ERP_B" ? "deliveries.provider.erpB" : "deliveries.provider.marketplaceA";
  const payload = useDeliveryPayloadState(delivery);
  const retentionLabels = {
    available: "deliveryDetail.retention.retained",
    expired: "deliveryDetail.retention.expired",
    missing: "deliveryDetail.retention.missing",
    unknown: "deliveryDetail.retention.unknown",
  } as const;

  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-app-border bg-app-border sm:grid-cols-2 lg:grid-cols-3">
      <SummaryField label={t("deliveryDetail.summary.event")} value={delivery.externalEventId} />
      <SummaryField label={t("deliveryDetail.summary.provider")} value={t(providerLabel)} />
      <SummaryField
        label={t("deliveryDetail.summary.status")}
        value={<StatusBadge status={delivery.status}>{t(statusLabelKeys[delivery.status])}</StatusBadge>}
      />
      <SummaryField label={t("deliveryDetail.summary.received")} value={formatDateTime(delivery.receivedAt, locale)} />
      <SummaryField label={t("deliveryDetail.summary.updated")} value={formatDateTime(delivery.updatedAt, locale)} />
      <SummaryField label={t("deliveryDetail.summary.attempts")} value={delivery.attemptCount.toString()} />
      <SummaryField label={t("deliveryDetail.summary.connectorMode")} value={formatLabel(delivery.connectorMode)} />
      <SummaryField label={t("deliveryDetail.summary.connectorStatus")} value={formatLabel(delivery.connectorStatus)} />
      <SummaryField label={t("deliveryDetail.summary.mappingVersion")} value={delivery.mappingVersion} />
      <SummaryField label={t("deliveryDetail.summary.nextAttempt")} value={formatDateTime(delivery.nextAttemptAt, locale)} />
      <SummaryField
        label={t("deliveryDetail.summary.payloadRetention")}
        value={t(retentionLabels[payload], { expiresAt: payload === "available" || payload === "expired" ? formatDateTime(delivery.payloadExpiresAt, locale) : "" })}
      />
      <SummaryField label={t("deliveryDetail.summary.coreOrder")} value={delivery.lastCoreOrderId ?? "-"} />
      <SummaryField label={t("deliveryDetail.summary.httpStatus")} value={delivery.lastHttpStatus?.toString() ?? "-"} />
      <SummaryField label={t("deliveryDetail.summary.correlation")} value={delivery.correlationId ?? "-"} />
      <SummaryField label={t("deliveryDetail.summary.errorCode")} value={delivery.errorCode === null ? "-" : formatLabel(delivery.errorCode)} />
      <SummaryField label={t("deliveryDetail.summary.safeError")} value={delivery.safeErrorMessage ?? "-"} />
    </dl>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
              <thead className="border-b border-app-border bg-app-canvas text-xs font-semibold text-app-foreground-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 text-right">{t("deliveryDetail.attempts.columns.attempt")}</th>
                  <th scope="col" className="px-4 py-3">{t("deliveryDetail.attempts.columns.outcome")}</th>
                  <th scope="col" className="px-4 py-3">{t("deliveryDetail.attempts.columns.started")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("deliveryDetail.attempts.columns.duration")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("deliveryDetail.attempts.columns.httpStatus")}</th>
                  <th scope="col" className="px-4 py-3">{t("deliveryDetail.attempts.columns.trace")}</th>
                  <th scope="col" className="px-4 py-3">{t("deliveryDetail.attempts.columns.error")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-surface-muted">
                {attempts.map((attempt) => (
                  <tr key={attempt.attemptId}>
                    <td className="px-4 py-3.5 text-right font-medium tabular-nums">{attempt.attemptNumber}</td>
                    <td className="px-4 py-3.5">
                      <AttemptOutcome outcome={attempt.outcome} />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-app-foreground-secondary">
                      {formatDateTime(attempt.startedAt, locale)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-app-foreground-secondary">
                      {attempt.durationMilliseconds === null ? "-" : formatDurationMilliseconds(attempt.durationMilliseconds, locale)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-app-foreground-secondary">{attempt.httpStatus ?? "-"}</td>
                    <td className="px-4 py-3.5 font-mono text-xs">
                      <AttemptTrace traceId={attempt.traceId} />
                    </td>
                    <td className="max-w-80 px-4 py-3.5">
                      <AttemptError code={attempt.errorCode} message={attempt.safeErrorMessage} />
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

function AttemptTrace({ traceId }: { traceId: string | null }) {
  const { t } = useTranslation();
  const url = jaegerTraceUrl(traceId);
  if (url === null || traceId === null) return <span className="text-app-foreground-faint">-</span>;

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

function AttemptError({ code, message }: { code: string | null; message: string | null }) {
  if (code === null) return <span className="text-app-foreground-faint">-</span>;

  return (
    <>
      <p className="font-mono text-xs font-medium text-red-800">{formatLabel(code)}</p>
      {message === null ? null : <p className="mt-1 truncate text-xs text-app-foreground-secondary" title={message}>{message}</p>}
    </>
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
