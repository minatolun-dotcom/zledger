import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Compact variant — less vertical padding, for small cards/panels. */
  compact?: boolean;
}

/** Default illustration: a soft document/ledger glyph in a gradient tile. */
function DefaultArtwork() {
  return (
    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 6.375h7.5M12.75 10.5h7.5M12.75 14.25h3.75" />
    </svg>
  );
}

/** Consistent empty-state placeholder for list/detail pages with no data. */
export function EmptyState({ title, description, icon, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? "py-8" : "py-16"}`}>
      {icon || (
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/60 text-slate-400 ring-1 ring-slate-200/80 dark:from-[#1a1a24] dark:to-[#16161f] dark:text-[#475569] dark:ring-[#282832]">
          <DefaultArtwork />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-700 dark:text-[#e2e8f0]">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-[#94a3b8]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
