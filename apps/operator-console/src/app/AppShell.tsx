import { ClipboardList, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";

import type { BrandTheme } from "../theme/brandThemes";

const navigation = [
  { to: "/orders", labelKey: "shell.navigation.orders", icon: ClipboardList },
  { to: "/simulator", labelKey: "shell.navigation.simulator", icon: FlaskConical },
] as const;

export function AppShell({ brandTheme }: { brandTheme: BrandTheme }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-app-canvas text-app-foreground">
      <header className="sticky top-0 z-30 border-b border-app-border bg-app-surface">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 md:w-[232px] md:border-r md:border-app-border md:pr-5">
            <img src={brandTheme.logoPath} alt="" className="size-8 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-foreground">{brandTheme.productName}</p>
              <p className="text-xs text-app-foreground-muted">{t(brandTheme.consoleNameKey)}</p>
            </div>
          </div>
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

        <main className="min-w-0 px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
