import { ClipboardList, FlaskConical, type LucideIcon, Network, RadioTower, Workflow } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { AccessTokenExpiryNotice } from "../auth/AccessTokenExpiryNotice";
import { AccessTokenControl } from "../auth/AccessTokenControl";
import { useAccessToken } from "../auth/accessTokenContext";
import { storeBrowserLocale, supportedLocales, type SupportedLocale } from "../i18n/i18n";
import { PendingReplayNotice } from "../pages/deliveries/PendingReplayNotice";
import type { BrandTheme } from "../theme/brandThemes";

type NavigationItem = {
  icon: LucideIcon;
  labelKey: "shell.navigation.orders" | "shell.navigation.deliveries" | "shell.navigation.simulator" | "shell.navigation.flowExplorer" | "shell.navigation.systemMap";
  requiresOperatorRole?: boolean;
  to: string;
};

const navigation: readonly NavigationItem[] = [
  { to: "/orders", labelKey: "shell.navigation.orders", icon: ClipboardList },
  { to: "/deliveries", labelKey: "shell.navigation.deliveries", icon: RadioTower, requiresOperatorRole: true },
  { to: "/simulator", labelKey: "shell.navigation.simulator", icon: FlaskConical },
  { to: "/flow-explorer", labelKey: "shell.navigation.flowExplorer", icon: Workflow },
  { to: "/system-map", labelKey: "shell.navigation.systemMap", icon: Network },
] as const;

export function AppShell({ brandTheme }: { brandTheme: BrandTheme }) {
  const { t } = useTranslation();
  const { identity } = useAccessToken();
  const { pathname } = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      mainContentRef.current?.focus({ preventScroll: true });
      previousPathnameRef.current = pathname;
    }
  }, [pathname]);

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
          <div className="flex min-w-0 items-center gap-3 lg:w-[232px] lg:border-r lg:border-app-border lg:pr-5">
            <img src={brandTheme.logoPath} alt="" className="size-8 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-foreground">{brandTheme.productName}</p>
              <p className="text-xs text-app-foreground-muted">{t(brandTheme.consoleNameKey)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AccessTokenControl />
            <LanguageSelector />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-screen-2xl lg:grid-cols-[232px_minmax(0,1fr)]">
        <nav
          aria-label={t("shell.navigation.label")}
          className="relative min-w-0 border-b border-app-border bg-app-surface px-3 py-2 lg:sticky lg:top-16 lg:z-20 lg:h-[calc(100vh-4rem)] lg:border-r lg:border-b-0 lg:px-4 lg:py-6"
        >
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:flex lg:flex-col">
            {navigation.filter((item) => item.requiresOperatorRole !== true || hasOperatorAccess(identity?.roles)).map(({ to, labelKey, icon: Icon }) => (
              <li key={to} className="min-w-0">
                <NavLink
                  to={to}
                  aria-label={t(labelKey)}
                  title={t(labelKey)}
                  className={({ isActive }) =>
                    [
                      "flex min-h-11 h-full min-w-0 items-center justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus lg:h-10 lg:min-h-10 lg:px-3",
                      isActive
                        ? "bg-app-navigation-active text-app-navigation-foreground shadow-sm"
                        : "text-app-foreground-secondary hover:bg-app-surface-muted hover:text-app-foreground",
                    ].join(" ")
                  }
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  <span className="min-w-0 whitespace-normal break-words leading-tight">{t(labelKey)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main
          ref={mainContentRef}
          id="main-content"
          tabIndex={-1}
          className="min-w-0 px-4 py-6 focus:outline-none sm:px-7 sm:py-8 lg:px-10 lg:py-10"
        >
          <div className="mx-auto w-full max-w-[1280px]">
            <AccessTokenExpiryNotice />
            <PendingReplayNotice />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function hasOperatorAccess(roles: ReadonlySet<string> | undefined): boolean {
  return roles?.has("operator") === true || roles?.has("platform-admin") === true;
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
