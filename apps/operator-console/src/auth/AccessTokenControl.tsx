import { KeyRound, ShieldCheck, Trash2, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "../components/ui/IconButton";
import { ModalDialog } from "../components/ui/ModalDialog";
import { useAccessToken } from "./accessTokenContext";

export function AccessTokenControl() {
  const { t } = useTranslation();
  const { accessToken, clearAccessToken, identity, setAccessToken } = useAccessToken();
  const [candidate, setCandidate] = useState("");
  const [feedback, setFeedback] = useState<"expired" | "invalid">();
  const [isOpen, setIsOpen] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  function openDialog() {
    setCandidate("");
    setFeedback(undefined);
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
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
              {identity !== undefined ? (
                <p className="mt-1 break-all text-xs text-app-foreground-muted">{identity.subject}</p>
              ) : null}
            </div>
            <IconButton label={t("shell.accessToken.close")} onClick={closeDialog} variant="ghost">
              <X aria-hidden="true" size={18} />
            </IconButton>
          </div>

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
                aria-describedby={feedback === undefined ? undefined : "operator-access-token-error"}
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
