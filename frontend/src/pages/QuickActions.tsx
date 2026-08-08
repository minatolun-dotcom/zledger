import { useNavigate } from "react-router-dom";
import { cardShell, iconTile } from "./dashboardShell";

const ACTIONS = [
  {
    label: "Create Voucher",
    route: "/vouchers",
    hover: "hover:border-blue-200 hover:bg-blue-50/50 dark:hover:border-blue-800 dark:hover:bg-blue-500/5",
    tile: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    label: "View Reports",
    route: "/reports",
    hover: "hover:border-emerald-200 hover:bg-emerald-50/50 dark:hover:border-emerald-800 dark:hover:bg-emerald-500/5",
    tile: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    label: "GST Compliance",
    route: "/gst",
    hover: "hover:border-amber-200 hover:bg-amber-50/50 dark:hover:border-amber-800 dark:hover:bg-amber-500/5",
    tile: "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    label: "Manage Accounts",
    route: "/chart-of-accounts",
    hover: "hover:border-violet-200 hover:bg-violet-50/50 dark:hover:border-violet-800 dark:hover:bg-violet-500/5",
    tile: "bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
];

/**
 * Dashboard quick-action tiles. `compact` is used when the card sits beside
 * the Smart Insights (a narrow 2/5 column): 1→2 columns instead of 2→4.
 */
export default function QuickActions({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className={`${cardShell} flex h-full w-full flex-col p-4`}>
      <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Quick Actions</p>
      <div className={`grid flex-1 gap-2 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.route)}
            className={`group flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${action.hover} dark:border-[#1a1a24] dark:text-[#cbd5e1]`}
          >
            <span className={`${iconTile} transition-transform duration-200 group-hover:scale-110 ${action.tile}`}>
              {action.icon}
            </span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
