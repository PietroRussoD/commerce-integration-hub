import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="not-found-heading" className="mx-auto max-w-xl rounded-md border border-app-border bg-app-surface px-6 py-14 text-center">
      <p className="font-mono text-sm font-semibold text-app-foreground-muted">404</p>
      <h1 id="not-found-heading" className="mt-2 text-xl font-semibold text-app-foreground">{t("notFound.title")}</h1>
      <p className="mt-2 text-sm text-app-foreground-secondary">{t("notFound.description")}</p>
      <Link to="/orders" className="mt-5 inline-flex h-9 items-center rounded-md bg-app-brand-primary px-3 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus">
        {t("notFound.orders")}
      </Link>
    </section>
  );
}
