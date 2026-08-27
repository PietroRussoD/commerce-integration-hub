import { ClipboardList, FlaskConical } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/simulator", label: "Simulator", icon: FlaskConical },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 md:w-[232px] md:border-r md:border-zinc-200 md:pr-5">
            <img src="/favicon.svg" alt="" className="size-8 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950">Commerce Integration Hub</p>
              <p className="text-xs text-zinc-500">Operator console</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-screen-2xl md:grid-cols-[232px_minmax(0,1fr)]">
        <nav
          aria-label="Primary"
          className="sticky top-16 z-20 border-b border-zinc-200 bg-white px-3 py-2 md:h-[calc(100vh-4rem)] md:border-r md:border-b-0 md:px-4 md:py-6"
        >
          <ul className="flex gap-1 md:flex-col">
            {navigation.map(({ to, label, icon: Icon }) => (
              <li key={to} className="min-w-0 flex-1 md:flex-none">
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    [
                      "flex h-10 items-center justify-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 md:justify-start",
                      isActive
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
                    ].join(" ")
                  }
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  <span className="truncate">{label}</span>
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
