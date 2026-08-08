import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useFyStore } from "../store/fy";
import { cardShell } from "./dashboardShell";

interface SmartInsight {
  type: "positive" | "warning" | "info";
  title: string;
  message: string;
  impact: "high" | "medium" | "low";
}

const STYLE: Record<
  SmartInsight["type"],
  { iconBg: string; icon: React.ReactNode; ring: string; label: string }
> = {
  positive: {
    label: "Positive",
    iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    ring: "border-emerald-200 dark:border-emerald-500/20",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  warning: {
    label: "Attention",
    iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    ring: "border-amber-200 dark:border-amber-500/20",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  info: {
    label: "Insight",
    iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    ring: "border-blue-200 dark:border-blue-500/20",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  },
};

export default function SmartInsights() {
  const [insights, setInsights] = useState<SmartInsight[]>([]);
  const { activeFyId } = useFyStore();

  useEffect(() => {
    if (!activeFyId) return;
    api
      .get<{ success: boolean; data: SmartInsight[] }>(
        `/dashboard/smart-insights?financial_year_id=${activeFyId}`
      )
      .then((res) => setInsights(res?.data ?? []))
      .catch(() => setInsights([]));
  }, [activeFyId]);

  if (!insights.length) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {insights.slice(0, 3).map((insight, i) => {
        const s = STYLE[insight.type] ?? STYLE.info;
        return (
          <div
            key={`${insight.title}-${i}`}
            className={`${cardShell} flex items-start gap-3 border p-4 ${s.ring}`}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.iconBg}`}>
              {s.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-[#f1f5f9]">
                  {insight.title}
                </p>
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:bg-[#282832] dark:text-[#94a3b8]">
                  {s.label}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-[#94a3b8]">
                {insight.message}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
