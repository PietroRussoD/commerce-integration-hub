import { useTranslation } from "react-i18next";

export function RouteLoading() {
  const { t } = useTranslation();

  return (
    <div role="status" className="flex items-center gap-3 border-y border-app-border px-4 py-8 text-sm text-app-foreground-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-app-border-strong border-t-app-brand-primary motion-reduce:animate-none" />
      {t("shell.loading")}
    </div>
  );
}
