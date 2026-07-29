/** Shared status badge — hides common default states, shows colored pill for non-default.
 *  For `is_active` booleans: shows nothing when active, "Inactive" label when not.
 *  For string statuses: uses a semantic color map, hides the common case ("active", "posted"). */
import type { ReactNode } from "react";

const STATUS_STYLES: Record<string, string> = {
  // State machine — non-default
  draft: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  pending: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  submitted: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  in_progress: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  generated: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  completed: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  filed: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  deposited: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  cancelled: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",
  failed: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",
  closed: "bg-slate-100 dark:bg-[#282832] text-slate-600 dark:text-[#94a3b8]",
  exhausted: "bg-slate-100 dark:bg-[#282832] text-slate-600 dark:text-[#94a3b8]",
  expired: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",
  overdue: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",
  disposed: "bg-slate-100 dark:bg-[#282832] text-slate-600 dark:text-[#94a3b8]",
  // Import job states
  parsed: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  importing: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  undone: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

const HIDDEN_DEFAULTS = new Set(["active", "posted"]);

interface StatusBadgeProps {
  status?: string | null;
  isActive?: boolean | null;
  className?: string;
}

export default function StatusBadge({ status, isActive, className = "" }: StatusBadgeProps): ReactNode {
  // Boolean is_active: show only when inactive
  if (isActive !== undefined) {
    if (isActive) return null;
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ${className}`}>
        Inactive
      </span>
    );
  }

  // String status: hide common defaults
  if (!status || HIDDEN_DEFAULTS.has(status)) return null;

  const style = STATUS_STYLES[status] || "bg-slate-100 dark:bg-[#282832] text-slate-600 dark:text-[#94a3b8]";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${style} ${className}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
