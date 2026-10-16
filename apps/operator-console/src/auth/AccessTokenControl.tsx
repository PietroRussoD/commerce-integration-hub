import { KeyRound, ShieldCheck, Trash2, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "../components/ui/IconButton";
import { ModalDialog } from "../components/ui/ModalDialog";
import { resolveIntlLocale } from "../i18n/i18n";
import { formatDateTime } from "../pages/orders/orderFormatters";
import { useAccessToken } from "./accessTokenContext";
import { useAccessTokenDialog } from "./accessTokenDialogContext";

export function AccessTokenControl() {
  const { t, i18n } = useTranslation();
  const { accessToken, clearAccessToken, hasExpired, identity, setAccessToken } = useAccessToken();
  const [candidate, setCandidate] = useState("");
  const [feedback, setFeedback] = useState<"expired" | "invalid">();
  const { isOpen, open, close } = useAccessTokenDialog();
  const tokenInputRef = useRef<HTMLInputElement>(null);

  function openDialog() {
    setCandidate("");
    setFeedback(undefined);
    open();
  }

  function closeDialog() {
    close();
    setCandidate("");
    setFeedback(undefined);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = setAccessToken(candidate);

    if (result.kind === "active") {
      closeDialog();
      return;
    }

    setFeedback(result.kind);
    tokenInputRef.current?.focus();
  }

  return (
    <>
      <IconButton
        label={identity === undefined ? t("shell.accessToken.open") : t("shell.accessToken.manage")}
        onClick={openDialog}
        variant={identity === undefined ? "bordered" : "ghost"}
      >
        {identity === undefined ? <KeyRound aria-hidden="true" size={17} /> : <ShieldCheck aria-hidden="true" size={18} />}
      </IconButton>

      {isOpen ? (
        <ModalDialog labelledBy="access-token-dialog-title" initialFocusRef={tokenInputRef} onClose={closeDialog}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="access-token-dialog-title" className="text-base font-semibold text-app-foreground">
                {t("shell.accessToken.title")}
              </h2>
            </div>
            <IconButton label={t("shell.accessToken.close")} onClick={closeDialog} variant="ghost">
              <X aria-hidden="true" size={18} />
            </IconButton>
          </div>

          {hasExpired ? <p role="status" className="mt-4 text-sm text-red-700">{t("shell.accessToken.sessionExpired")}</p> : null}
          <p id="operator-access-token-help" className="mt-4 text-sm text-app-foreground-secondary">{t("shell.accessToken.memory")}</p>
          <p className="mt-2 text-sm text-app-foreground-secondary">{t("shell.accessToken.verification")}</p>
          {identity !== undefined ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="text-app-foreground-secondary">{t("shell.accessToken.subject")}</dt><dd className="break-all">{identity.subject}</dd></div>
              <div><dt className="text-app-foreground-secondary">{t("shell.accessToken.roles")}</dt><dd>{[...identity.roles].join(", ") || t("shell.accessToken.noRoles")}</dd></div>
              <div><dt className="text-app-foreground-secondary">{t("shell.accessToken.expiresAt")}</dt><dd><time dateTime={identity.expiresAt.toISOString()}>{formatDateTime(identity.expiresAt.toISOString(), resolveIntlLocale(i18n.resolvedLanguage))}</time></dd></div>
            </dl>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="operator-access-token" className="text-sm font-medium text-app-foreground">
                {t("shell.accessToken.fieldLabel")}
              </label>
              <input
                ref={tokenInputRef}
                id="operator-access-token"
                value={candidate}
                onChange={(event) => {
                  setCandidate(event.target.value);
                  setFeedback(undefined);
                }}
                aria-invalid={feedback !== undefined || undefined}
                aria-describedby={feedback === undefined ? "operator-access-token-help" : "operator-access-token-help operator-access-token-error"}
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                className="mt-2 h-10 w-full rounded-md border border-app-border-strong bg-app-canvas px-3 font-mono text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus/25"
              />
              {feedback !== undefined ? (
                <p id="operator-access-token-error" role="alert" className="mt-2 text-sm text-red-700">
                  {t(`shell.accessToken.${feedback}`)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {accessToken !== undefined ? (
                <button
                  type="button"
                  onClick={clearAccessToken}
                  className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-app-foreground-secondary hover:bg-app-surface-muted hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
                >
                  <Trash2 aria-hidden="true" size={16} />
                  {t("shell.accessToken.clear")}
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="h-9 rounded-md bg-app-navigation-active px-3 text-sm font-semibold text-app-navigation-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
              >
                {t("shell.accessToken.apply")}
              </button>
            </div>
          </form>
        </ModalDialog>
      ) : null}
    </>
  );
}
