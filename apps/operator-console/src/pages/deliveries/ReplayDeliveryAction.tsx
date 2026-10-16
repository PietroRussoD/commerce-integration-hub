import { RotateCw, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAccessToken } from "../../auth/accessTokenContext";
import { IconButton } from "../../components/ui/IconButton";
import { ModalDialog } from "../../components/ui/ModalDialog";
import { isReplayUnresolved, replayRequestKey, useReplayRequests } from "./replayRequestsContext";
import { getReplayBlockingReasons, getReplayRejectionReason, type ReplayBlockingReason, type ReplayDeliveryTarget } from "./deliveryReplayEligibility";
import { readDeliveryPayloadState, useDeliveryPayloadState } from "./useDeliveryPayloadState";

interface ReplayDeliveryActionProps {
  accessToken: string;
  hasReplayPermission: boolean;
  delivery: ReplayDeliveryTarget;
  isRefreshing?: boolean;
  isReadError?: boolean;
}

export function ReplayDeliveryAction({ accessToken, hasReplayPermission, delivery, isRefreshing = false, isReadError = false }: ReplayDeliveryActionProps) {
  const { t } = useTranslation();
  const { deliveryId } = delivery;
  const payload = useDeliveryPayloadState(delivery);
  const blockingReasons: ReplayBlockingReason[] = getReplayBlockingReasons(delivery, hasReplayPermission, payload);
  if (isRefreshing) blockingReasons.push("updating");
  if (isReadError) blockingReasons.push("readFailed");
  const canReplay = blockingReasons.length === 0;
  const { cacheScope } = useAccessToken();
  const { pendingDeliveryIds, requests, reset, submit: submitReplay } = useReplayRequests();
  const request = requests.get(replayRequestKey(cacheScope, deliveryId));
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState(request?.reason ?? "");
  const [validationMessage, setValidationMessage] = useState<string>();
  const [submissionBlock, setSubmissionBlock] = useState<string>();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isPending = pendingDeliveryIds.has(deliveryId);
  const isSuccess = request?.data !== undefined;
  const unresolved = isReplayUnresolved(request);
  const rejectionReason = getReplayRejectionReason(request?.error);

  useEffect(() => {
    // Keep focus on an available control when pending or accepted submission
    // disables or removes the form controls.
    if (!isOpen) return;
    const focused = document.activeElement;
    const unavailableFocus = focused === document.body || focused?.matches(":disabled") === true;
    // Preserve an editable reason's focus while a background read temporarily
    // disables confirmation. Move only when the active control is unavailable.
    if (isPending || isSuccess || (!canReplay && !unresolved && unavailableFocus)) closeButtonRef.current?.focus();
  }, [isOpen, isPending, isSuccess, canReplay, unresolved]);

  const canOpen = hasReplayPermission && (canReplay || unresolved || isPending);

  function openDialog() {
    if (!canOpen) return;
    if (!isPending && !unresolved) {
      reset(deliveryId, cacheScope);
      setReason("");
    } else if (request !== undefined) {
      setReason(request.reason);
    }
    setValidationMessage(undefined);
    setSubmissionBlock(undefined);
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    setValidationMessage(undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    // Recheck the wall clock at confirmation even if a background timer or React
    // render is delayed. Recovery uses the original intent, whose audit result
    // the Gateway resolves before applying new-replay eligibility rules.
    if (!unresolved) {
      const currentBlocks = getReplayBlockingReasons(delivery, hasReplayPermission, readDeliveryPayloadState(delivery));
      if (isRefreshing) currentBlocks.push("updating");
      if (isReadError) currentBlocks.push("readFailed");
      if (currentBlocks.length > 0) {
        setSubmissionBlock(t(`deliveryDetail.replay.blocked.${currentBlocks[0]}`));
        closeButtonRef.current?.focus();
        return;
      }
    }
    const trimmedReason = unresolved ? request!.reason : reason.trim();
    if (trimmedReason.length === 0) {
      setValidationMessage(t("deliveryDetail.replay.reasonRequired"));
      reasonRef.current?.focus();
      return;
    }

    setValidationMessage(undefined);
    setSubmissionBlock(undefined);
    // The provider stores errors for this session, including after route unmount.
    void submitReplay({ accessToken, cacheScope, deliveryId, reason: trimmedReason }).catch(() => undefined);
  }

  return (
    <section aria-labelledby="delivery-replay-heading" className="rounded-md border border-app-border bg-app-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="delivery-replay-heading" className="text-base font-semibold">{t("deliveryDetail.replay.sectionTitle")}</h2>
        <button
          type="button"
          onClick={openDialog}
          disabled={!canOpen}
          aria-describedby="delivery-replay-guidance delivery-replay-availability"
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 py-1.5 text-sm font-semibold text-app-foreground hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCw aria-hidden="true" size={16} />
          {t(isPending ? "deliveryDetail.replay.viewPending" : unresolved ? "deliveryDetail.replay.recover" : "deliveryDetail.replay.open")}
        </button>
      </div>
      <p id="delivery-replay-guidance" className="mt-3 text-sm text-app-foreground-secondary">{t(unresolved ? "deliveryDetail.replay.recoveryGuidance" : "deliveryDetail.replay.guidance")}</p>
      <div id="delivery-replay-availability"><ReplayBlockingNotice reasons={blockingReasons} /></div>

      {isOpen ? (
        <ModalDialog labelledBy="delivery-replay-dialog-title" initialFocusRef={reasonRef} onClose={closeDialog}>
          <div className="flex items-start justify-between gap-4">
            <h2 id="delivery-replay-dialog-title" className="text-base font-semibold text-app-foreground">
              {t("deliveryDetail.replay.title")}
            </h2>
            <IconButton ref={closeButtonRef} label={t("deliveryDetail.replay.close")} onClick={closeDialog} variant="ghost">
              <X aria-hidden="true" size={18} />
            </IconButton>
          </div>

          <p className="mt-4 text-sm text-app-foreground-secondary">{t(unresolved ? "deliveryDetail.replay.recoveryGuidance" : "deliveryDetail.replay.guidance")}</p>
          {!unresolved ? <ReplayBlockingNotice reasons={blockingReasons} /> : null}
          {submissionBlock !== undefined ? <p role="alert" className="mt-3 text-sm text-red-700">{submissionBlock}</p> : null}
          {isPending ? <p role="status" className="mt-5 text-sm text-app-foreground-secondary">{t("deliveryDetail.replay.pending")}</p> : null}
          {request?.data === undefined ? (
            <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="delivery-replay-reason" className="text-sm font-medium text-app-foreground">
                  {t("deliveryDetail.replay.reason")}
                </label>
                <textarea
                  ref={reasonRef}
                  id="delivery-replay-reason"
                  value={(isPending || unresolved) && request !== undefined ? request.reason : reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setValidationMessage(undefined);
                  }}
                  aria-invalid={validationMessage !== undefined || undefined}
                  aria-describedby={[
                    validationMessage === undefined ? "" : "delivery-replay-reason-error",
                    request?.error !== undefined ? "delivery-replay-request-error" : "",
                  ].filter(Boolean).join(" ") || undefined}
                  rows={4}
                  maxLength={1_000}
                  required
                  readOnly={unresolved}
                  disabled={isPending}
                  className="mt-2 w-full resize-y rounded-md border border-app-border-strong bg-app-canvas px-3 py-2 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                {validationMessage !== undefined ? <p id="delivery-replay-reason-error" role="alert" className="mt-2 text-sm text-red-700">{validationMessage}</p> : null}
                {request?.error !== undefined ? (
                  <p id="delivery-replay-request-error" role="alert" className="mt-2 text-sm text-red-700">
                    {t(request.isUncertain ? "deliveryDetail.replay.uncertain" : "deliveryDetail.replay.rejected")} {rejectionReason === undefined ? request.error.message : t(`deliveryDetail.replay.blocked.${rejectionReason}`)}
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPending || (!canReplay && !unresolved)}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-app-navigation-active px-3 text-sm font-semibold text-app-navigation-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCw aria-hidden="true" size={16} className={isPending ? "animate-spin" : undefined} />
                  {t(unresolved ? "deliveryDetail.replay.retrySame" : "deliveryDetail.replay.submit")}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 space-y-4">
              <p role="status" className="text-sm text-app-foreground-secondary">
                {t(request.data.outcome === "REPLAYED" ? "deliveryDetail.replay.replayed" : "deliveryDetail.replay.inProgress", {
                  commandId: request.data.commandId,
                })}
              </p>
              <p className="text-sm text-app-foreground-secondary">
                {t(request.data.outcome === "REPLAYED" ? "deliveryDetail.replay.replayedExplanation" : "deliveryDetail.replay.inProgressExplanation")}
              </p>
              {request.data.outcome === "IN_PROGRESS" ? (
                <button type="button" disabled={isPending} onClick={() => {
                  void submitReplay({ accessToken, cacheScope, deliveryId, reason: request.reason }).catch(() => undefined);
                }} className="rounded-md border border-app-border-strong px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus disabled:opacity-60">
                  {t("deliveryDetail.replay.retrySame")}
                </button>
              ) : null}
            </div>
          )}
        </ModalDialog>
      ) : null}
    </section>
  );
}

function ReplayBlockingNotice({ reasons }: { reasons: readonly ReplayBlockingReason[] }) {
  const { t } = useTranslation();
  return (
    <div aria-live="polite" aria-atomic="true">
      {reasons.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-app-foreground-secondary">
          {reasons.map((reason) => <li key={reason}>{t(`deliveryDetail.replay.blocked.${reason}`)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
