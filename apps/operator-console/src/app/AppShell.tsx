import { Boxes, ClipboardList, FlaskConical } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/simulator", label: "Simulator", icon: FlaskConical },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-stone-100 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-4 sm:px-6">
          <span className="grid size-9 place-items-center rounded-md bg-zinc-900 text-white">
            <Boxes aria-hidden="true" size={19} strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-sm font-semibold">Commerce Integration Hub</p>
            <p className="text-xs text-zinc-500">Operator console</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-screen-2xl md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Primary" className="border-b border-zinc-200 bg-white p-3 md:min-h-[calc(100vh-4rem)] md:border-r md:border-b-0">
          <ul className="flex gap-1 md:flex-col">
            {navigation.map(({ to, label, icon: Icon }) => (
              <li key={to} className="min-w-0 flex-1 md:flex-none">
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    [
                      "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                      isActive ? "bg-emerald-50 text-emerald-900" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
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

        <main className="min-w-0 p-5 sm:p-7 lg:p-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
