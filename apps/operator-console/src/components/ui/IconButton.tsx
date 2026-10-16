import { type ComponentPropsWithRef, type ReactNode } from "react";

type IconButtonProps = Omit<ComponentPropsWithRef<"button">, "aria-label" | "children" | "title"> & {
  label: string;
  children: ReactNode;
  variant?: "bordered" | "ghost";
  size?: "sm" | "md";
};

const variantClassNames = {
  bordered:
    "border border-app-border-strong bg-app-surface text-app-foreground-secondary hover:bg-app-canvas hover:text-app-foreground",
  ghost: "text-app-foreground-muted hover:text-app-foreground",
} as const;

const sizeClassNames = {
  sm: "size-9",
  md: "size-10",
} as const;

export function IconButton({
  label,
  children,
  variant = "bordered",
  size = "sm",
  type = "button",
  className = "",
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      aria-label={label}
      title={label}
      className={`grid shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus disabled:cursor-not-allowed disabled:opacity-50 ${variantClassNames[variant]} ${sizeClassNames[size]} ${className}`}
    >
      {children}
    </button>
  );
}
