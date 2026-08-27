import { type ButtonHTMLAttributes, type ReactNode } from "react";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children" | "title"> & {
  label: string;
  children: ReactNode;
  variant?: "bordered" | "ghost";
  size?: "sm" | "md";
};

const variantClassNames = {
  bordered: "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950",
  ghost: "text-zinc-500 hover:text-zinc-900",
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
      className={`grid shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 ${variantClassNames[variant]} ${sizeClassNames[size]} ${className}`}
    >
      {children}
    </button>
  );
}
