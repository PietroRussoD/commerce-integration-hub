import { useTranslation } from "react-i18next";

import type { OperatorOrderSearchProjectionStatus } from "../../api/integrationCoreClient";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { resolveIntlLocale } from "../../i18n/i18n";
import { formatDateTime } from "./orderFormatters";

interface SearchProjectionStatusProps {
  status?: OperatorOrderSearchProjectionStatus;
  isPending: boolean;
  isError: boolean;
}

const availabilityPresentation = {
  AVAILABLE: { badgeStatus: "READY", labelKey: "orders.searchProjection.availability.available" },
  NOT_INITIALIZED: { badgeStatus: "PROCESSING", labelKey: "orders.searchProjection.availability.notInitialized" },
  UNAVAILABLE: { badgeStatus: "FAILED", labelKey: "orders.searchProjection.availability.unavailable" },
} as const;

const reindexPhasePresentation = {
  IDLE: { badgeStatus: "READY", labelKey: "orders.searchProjection.reindex.phases.idle" },
  PREPARING: { badgeStatus: "PROCESSING", labelKey: "orders.searchProjection.reindex.phases.preparing" },
  REBUILDING: { badgeStatus: "PROCESSING", labelKey: "orders.searchProjection.reindex.phases.rebuilding" },
  READY_FOR_CUTOVER: { badgeStatus: "PROCESSING", labelKey: "orders.searchProjection.reindex.phases.readyForCutover" },
} as const;

export function SearchProjectionStatus({ status, isPending, isError }: SearchProjectionStatusProps) {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.resolvedLanguage);

  if (isPending) {
    return (
      <section aria-label={t("orders.searchProjection.title")} className="mt-5 rounded-md border border-app-border bg-app-surface px-4 py-3">
        <p role="status" className="text-sm text-app-foreground-secondary">
          {t("orders.searchProjection.loading")}
        </p>
      </section>
    );
  }

  if (isError || status === undefined) {
    return (
      <section aria-label={t("orders.searchProjection.title")} className="mt-5 rounded-md border border-app-border bg-app-surface px-4 py-3">
        <p className="text-sm text-app-foreground-secondary">{t("orders.searchProjection.unavailable")}</p>
      </section>
    );
  }

  const availability = availabilityPresentation[status.availability as keyof typeof availabilityPresentation];
  const presentation = availability ?? availabilityPresentation.UNAVAILABLE;
  const reindexPhase = reindexPhasePresentation[status.reindex.phase as keyof typeof reindexPhasePresentation];
  const reindexPresentation = reindexPhase ?? reindexPhasePresentation.IDLE;

  return (
    <section aria-labelledby="search-projection-heading" className="mt-5 rounded-md border border-app-border bg-app-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <div>
          <h2 id="search-projection-heading" className="text-sm font-semibold text-app-foreground">
            {t("orders.searchProjection.title")}
          </h2>
          <p className="mt-0.5 text-xs text-app-foreground-secondary">{t("orders.searchProjection.description")}</p>
        </div>
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="text-app-foreground-secondary">{t("orders.searchProjection.availability.label")}</dt>
            <dd>
              <StatusBadge status={presentation.badgeStatus}>{t(presentation.labelKey)}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-app-foreground-secondary">{t("orders.searchProjection.alias")}</dt>
            <dd className="font-mono text-sm text-app-foreground">{status.readAlias}</dd>
          </div>
          <div>
            <dt className="text-xs text-app-foreground-secondary">{t("orders.searchProjection.reconciliation")}</dt>
            <dd className="text-sm text-app-foreground">
              {status.reconciliationInProgress
                ? t("orders.searchProjection.inProgress")
                : status.lastReconciliationCompletedAt === null
                  ? t("orders.searchProjection.notRun")
                  : t("orders.searchProjection.lastCompleted", {
                      completedAt: formatDateTime(status.lastReconciliationCompletedAt, locale),
                      scanned: status.lastReconciliationScannedCount ?? 0,
                      applied: status.lastReconciliationAppliedCount ?? 0,
                    })}
            </dd>
          </div>
        </dl>
      </div>
      <div className="mt-3 border-t border-app-border pt-3">
        <h3 className="text-xs font-semibold text-app-foreground">{t("orders.searchProjection.reindex.title")}</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
          <div className="flex items-center gap-2">
            <dt className="text-app-foreground-secondary">{t("orders.searchProjection.reindex.phase")}</dt>
            <dd>
              <StatusBadge status={reindexPresentation.badgeStatus}>{t(reindexPresentation.labelKey)}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-app-foreground-secondary">{t("orders.searchProjection.reindex.sourceIndex")}</dt>
            <dd className="font-mono text-sm text-app-foreground">
              {status.reindex.sourceIndex ?? t("orders.searchProjection.reindex.notAvailable")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-app-foreground-secondary">{t("orders.searchProjection.reindex.candidateIndex")}</dt>
            <dd className="font-mono text-sm text-app-foreground">
              {status.reindex.candidateIndex ?? t("orders.searchProjection.reindex.notAvailable")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-app-foreground-secondary">{t("orders.searchProjection.reindex.scanned")}</dt>
            <dd className="text-sm text-app-foreground">{status.reindex.scannedCount.toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-app-foreground-secondary">{t("orders.searchProjection.reindex.applied")}</dt>
            <dd className="text-sm text-app-foreground">
              {t("orders.searchProjection.reindex.appliedValue", {
                applied: status.reindex.appliedCount.toLocaleString(locale),
                ignored: status.reindex.ignoredNonNewerVersionCount.toLocaleString(locale),
              })}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
