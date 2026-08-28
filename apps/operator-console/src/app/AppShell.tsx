import { ClipboardList, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";

import { storeBrowserLocale, supportedLocales, type SupportedLocale } from "../i18n/i18n";
import type { BrandTheme } from "../theme/brandThemes";

const navigation = [
  { to: "/orders", labelKey: "shell.navigation.orders", icon: ClipboardList },
  { to: "/simulator", labelKey: "shell.navigation.simulator", icon: FlaskConical },
] as const;

export function AppShell({ brandTheme }: { brandTheme: BrandTheme }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-app-canvas text-app-foreground">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-app-navigation-active px-3 py-2 text-sm font-semibold text-app-navigation-foreground shadow-lg transition-transform focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
      >
        {t("shell.skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b border-app-border bg-app-surface">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 md:w-[232px] md:border-r md:border-app-border md:pr-5">
            <img src={brandTheme.logoPath} alt="" className="size-8 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-foreground">{brandTheme.productName}</p>
              <p className="text-xs text-app-foreground-muted">{t(brandTheme.consoleNameKey)}</p>
            </div>
          </div>
          <LanguageSelector />
        </div>
      </header>

      <div className="mx-auto grid max-w-screen-2xl md:grid-cols-[232px_minmax(0,1fr)]">
        <nav
          aria-label={t("shell.navigation.label")}
          className="sticky top-16 z-20 border-b border-app-border bg-app-surface px-3 py-2 md:h-[calc(100vh-4rem)] md:border-r md:border-b-0 md:px-4 md:py-6"
        >
          <ul className="flex gap-1 md:flex-col">
            {navigation.map(({ to, labelKey, icon: Icon }) => (
              <li key={to} className="min-w-0 flex-1 md:flex-none">
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    [
                      "flex h-10 items-center justify-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus md:justify-start",
                      isActive
                        ? "bg-app-navigation-active text-app-navigation-foreground shadow-sm"
                        : "text-app-foreground-secondary hover:bg-app-surface-muted hover:text-app-foreground",
                    ].join(" ")
                  }
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  <span className="truncate">{t(labelKey)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main-content" tabIndex={-1} className="min-w-0 px-4 py-6 focus:outline-none sm:px-7 sm:py-8 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const activeLocale: SupportedLocale = i18n.resolvedLanguage === "it" ? "it" : "en";

  function selectLocale(locale: SupportedLocale) {
    storeBrowserLocale(locale);
    void i18n.changeLanguage(locale);
  }

  return (
    <div
      role="group"
      aria-label={t("shell.language.label")}
      className="flex shrink-0 rounded-md border border-app-border-strong bg-app-canvas p-0.5"
    >
      {supportedLocales.map((locale) => (
        <button
          key={locale}
          type="button"
          aria-label={locale === "en" ? t("shell.language.english") : t("shell.language.italian")}
          aria-pressed={activeLocale === locale}
          onClick={() => selectLocale(locale)}
          className="h-7 min-w-9 rounded px-2 text-xs font-semibold uppercase text-app-foreground-secondary transition-colors aria-pressed:bg-app-surface aria-pressed:text-app-foreground aria-pressed:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus"
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
