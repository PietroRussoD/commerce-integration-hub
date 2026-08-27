import { type ReactNode } from "react";

const statusClassNames: Record<string, string> = {
  RECEIVED: "bg-sky-50 text-sky-800 ring-sky-600/20",
  PROCESSING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  STARTED: "bg-amber-50 text-amber-800 ring-amber-600/20",
  READY: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  SUCCEEDED: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  FAILED: "bg-red-50 text-red-800 ring-red-600/20",
};

const fallbackClassName = "bg-zinc-100 text-zinc-700 ring-zinc-500/20";

export function StatusBadge({ status, children }: { status: string; children: ReactNode }) {
  const colorClassName = statusClassNames[status] ?? fallbackClassName;

  return (
    <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ring-1 ring-inset ${colorClassName}`}>
      {children}
    </span>
  );
}
