import { useTranslation } from "react-i18next";

import { useAccessTokenDialog } from "./accessTokenDialogContext";

export function AccessTokenButton({ onBeforeOpen }: { onBeforeOpen?: () => void }) {
  const { t } = useTranslation();
  const { open } = useAccessTokenDialog();
  return (
    <button type="button" onClick={() => {
      if (onBeforeOpen === undefined) open();
      else {
        // Let the originating modal release focus and its scroll lock first.
        onBeforeOpen();
        window.setTimeout(open, 0);
      }
    }}
      className="mt-3 rounded-md border border-app-border-strong bg-app-surface px-3 py-2 text-sm font-semibold text-app-foreground hover:bg-app-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
      {t("shell.accessToken.replace")}
    </button>
  );
}
