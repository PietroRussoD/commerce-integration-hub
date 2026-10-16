import { useTranslation } from "react-i18next";

import { AccessTokenButton } from "./AccessTokenButton";
import { useAccessToken } from "./accessTokenContext";

export function AccessTokenExpiryNotice() {
  const { t } = useTranslation();
  const { hasExpired } = useAccessToken();
  if (!hasExpired) return null;
  return (
    <div role="alert" className="mb-5 rounded-md border border-app-border bg-app-surface p-4 text-sm text-app-foreground">
      <p>{t("shell.accessToken.sessionExpired")}</p>
      <AccessTokenButton />
    </div>
  );
}
