import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "warning";
type Size = "sm" | "xs";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500",
  secondary:
    "border border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] focus-visible:ring-brand-500",
  danger:
    "border border-red-200 dark:border-red-500/20 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 focus-visible:ring-red-500",
  warning:
    "border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 focus-visible:ring-amber-500",
};

const SIZES: Record<Size, string> = {
  sm: "rounded-lg px-4 py-1.5 text-sm font-medium",
  xs: "rounded px-2.5 py-1 text-xs font-medium",
};

/**
 * Shared button. Normalizes the dominant outline/primary/danger patterns used
 * across the app into one component. Defaults to the secondary (outline) style.
 */
export default function Button({
  variant = "secondary",
  size = "sm",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-[#16161f] disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
