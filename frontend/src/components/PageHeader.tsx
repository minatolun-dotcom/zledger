import type { ReactNode } from "react";
import NotificationBell from "./NotificationBell";

interface PageHeaderProps {
  title: string;
  /** Subtitle or description shown next to the title */
  subtitle?: string;
  /** Right-side content: action buttons, badges, selectors */
  actions?: ReactNode;
  /** Optional tab bar rendered below the title row */
  tabs?: ReactNode;
  /** Additional classes for the outer wrapper */
  className?: string;
}

/**
 * Sticky page header. Pins to the top of the scroll container (<main>).
 * Normalizes title size, border, padding, and dark mode across all pages.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  tabs,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`sticky top-0 z-20 border-b border-slate-200/60 dark:border-[#1a1a24] bg-white dark:bg-[#08080c] -mx-4 px-4 pt-4 pb-3 lg:-mx-8 lg:px-8 lg:pt-8 lg:pb-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] truncate">
            {title}
          </h2>
          {subtitle && (
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-[#64748b] whitespace-nowrap">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {actions}
          <NotificationBell />
        </div>
      </div>
      {tabs && <div className="-mb-px">{tabs}</div>}
    </div>
  );
}
