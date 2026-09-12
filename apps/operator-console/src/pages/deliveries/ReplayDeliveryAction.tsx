import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCw, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { replayOperatorDelivery } from "../../api/connectorGatewayClient";
import { IconButton } from "../../components/ui/IconButton";

interface ReplayDeliveryActionProps {
  accessToken: string;
  canReplay: boolean;
  deliveryId: string;
  onReplayAccepted: () => void;
}

export function ReplayDeliveryAction({ accessToken, canReplay, deliveryId, onReplayAccepted }: ReplayDeliveryActionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [validationMessage, setValidationMessage] = useState<string>();
  const mutation = useMutation({
    mutationFn: (submittedReason: string) =>
      replayOperatorDelivery({
        accessToken,
        deliveryId,
        idempotencyKey: crypto.randomUUID(),
        reason: submittedReason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["operator-deliveries"] });
      onReplayAccepted();
    },
  });

  if (!canReplay) return null;

  function openDialog() {
    mutation.reset();
    setReason("");
    setValidationMessage(undefined);
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    setValidationMessage(undefined);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
      setValidationMessage(t("deliveryDetail.replay.reasonRequired"));
      return;
    }

    setValidationMessage(undefined);
    mutation.mutate(trimmedReason);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-semibold text-app-foreground hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
      >
        <RotateCw aria-hidden="true" size={16} />
        {t("deliveryDetail.replay.open")}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation">
          <section
            aria-labelledby="delivery-replay-dialog-title"
            aria-modal="true"
            role="dialog"
            className="w-full max-w-lg rounded-md border border-app-border bg-app-surface p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="delivery-replay-dialog-title" className="text-base font-semibold text-app-foreground">
                {t("deliveryDetail.replay.title")}
              </h2>
              <IconButton label={t("deliveryDetail.replay.close")} onClick={closeDialog} variant="ghost">
                <X aria-hidden="true" size={18} />
              </IconButton>
            </div>

            {mutation.data === undefined ? (
              <form className="mt-5 space-y-4" onSubmit={submit}>
                <div>
                  <label htmlFor="delivery-replay-reason" className="text-sm font-medium text-app-foreground">
                    {t("deliveryDetail.replay.reason")}
                  </label>
                  <textarea
                    id="delivery-replay-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    maxLength={1_000}
                    required
                    disabled={mutation.isPending}
                    className="mt-2 w-full resize-y rounded-md border border-app-border-strong bg-app-canvas px-3 py-2 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  {validationMessage !== undefined ? <p role="alert" className="mt-2 text-sm text-red-700">{validationMessage}</p> : null}
                  {mutation.isError ? <p role="alert" className="mt-2 text-sm text-red-700">{mutation.error.message}</p> : null}
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-app-navigation-active px-3 text-sm font-semibold text-app-navigation-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCw aria-hidden="true" size={16} className={mutation.isPending ? "animate-spin" : undefined} />
                    {t("deliveryDetail.replay.submit")}
                  </button>
                </div>
              </form>
            ) : (
              <p role="status" className="mt-5 text-sm text-app-foreground-secondary">
                {t(mutation.data.outcome === "REPLAYED" ? "deliveryDetail.replay.replayed" : "deliveryDetail.replay.inProgress", {
                  commandId: mutation.data.commandId,
                })}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
