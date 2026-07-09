import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface PendingActionsData {
  unreconciled_bank_entries: number;
  outstanding_receivables: number;
}

export default function PendingActions() {
  const [data, setData] = useState<PendingActionsData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<PendingActionsData>("/dashboard/pending-actions").then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const items = [
    {
      label: "Unreconciled Bank Entries",
      value: data.unreconciled_bank_entries,
      color: "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
      onClick: () => navigate("/bank-reconciliation"),
    },
    {
      label: "Outstanding Receivables",
      value: data.outstanding_receivables,
      isCurrency: true,
      color: "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10",
      iconColor: "text-red-600 dark:text-red-400",
      onClick: () => navigate("/payments"),
    },
  ];

  const hasAnyPending = items.some((item) => item.value > 0);

  if (!hasAnyPending) return null;

  return (
    <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25]">
      <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Pending Actions</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={item.onClick}
            className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm dark:border-[#282832] dark:bg-[#1e1e28]"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
              <svg className={`h-4 w-4 ${item.iconColor}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">{item.label}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">
                {item.isCurrency ? `₹${fmt(item.value)}` : item.value}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
