import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { cardShell, iconTile, rowInteractive } from "./dashboardShell";

interface PendingActionsData {
  unreconciled_bank_entries: number;
  outstanding_receivables: number;
  upcoming_gst_returns: number;
  draft_vouchers: number;
  pending_einvoices: number;
  failed_einvoices: number;
  pending_eway_bills: number;
  failed_eway_bills: number;
}

interface PendingItem {
  key: string;
  group: "banking" | "tax" | "vouchers";
  label: string;
  subtitle: string;
  value: number;
  isCurrency?: boolean;
  /** Failed/blocked items — highlighted in the urgency summary. */
  urgent?: boolean;
  icon: React.ReactNode;
  iconBg: string;
  badgeBg: string;
  onClick?: () => void;
}

const GROUP_LABELS: Record<string, string> = {
  banking: "Banking",
  tax: "Tax & Compliance",
  vouchers: "Vouchers",
};

const GROUP_ORDER = ["banking", "tax", "vouchers"];

export default function PendingActions({
  onEmptyChange,
}: {
  /** Fired with true when nothing is pending (lets the parent expand siblings). */
  onEmptyChange?: (empty: boolean) => void;
}) {
  const [data, setData] = useState<PendingActionsData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<PendingActionsData>("/dashboard/pending-actions").then(setData).catch(() => {});
  }, []);

  // All hooks must run unconditionally — never after an early return.
  const hasAnyPending = data
    ? [
        data.unreconciled_bank_entries,
        data.outstanding_receivables,
        data.upcoming_gst_returns,
        data.draft_vouchers,
        data.pending_einvoices,
        data.failed_einvoices,
        data.pending_eway_bills,
        data.failed_eway_bills,
      ].some((v) => v > 0)
    : false;

  // Only report emptiness once data has actually loaded — while loading
  // (data null) we must stay visible or the parent would unmount us before
  // the fetch resolves.
  const isEmpty = data !== null && !hasAnyPending;

  useEffect(() => {
    onEmptyChange?.(isEmpty);
  }, [isEmpty, onEmptyChange]);

  if (!data) return null;

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const items: PendingItem[] = [
    {
      key: "unreconciled",
      group: "banking",
      label: "Unreconciled Bank Entries",
      subtitle: "Needs your attention",
      value: data.unreconciled_bank_entries,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
      badgeBg: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
      onClick: () => navigate("/bank-reconciliation"),
    },
    {
      key: "receivables",
      group: "banking",
      label: "Outstanding Receivables",
      subtitle: "Total Amount",
      value: data.outstanding_receivables,
      isCurrency: true,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      ),
      iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
      badgeBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
      onClick: () => navigate("/payments"),
    },
    {
      key: "gst",
      group: "tax",
      label: "GST Returns Due",
      subtitle: "GSTR-1 due in 5 days",
      value: data.upcoming_gst_returns,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      ),
      iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
      badgeBg: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
      onClick: () => navigate("/gst"),
    },
    {
      key: "drafts",
      group: "vouchers",
      label: "Draft Vouchers",
      subtitle: "Requires review",
      value: data.draft_vouchers,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      iconBg: "bg-slate-200 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400",
      badgeBg: "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400",
      onClick: () => navigate("/vouchers"),
    },
    {
      key: "pending_einv",
      group: "tax",
      label: "Pending E-Invoices",
      subtitle: "Awaiting generation",
      value: data.pending_einvoices,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      iconBg: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
      badgeBg: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400",
      onClick: () => navigate("/einvoice"),
    },
    {
      key: "failed_einv",
      group: "tax",
      label: "Failed E-Invoices",
      subtitle: "Requires retry",
      value: data.failed_einvoices,
      urgent: true,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
      iconBg: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400",
      badgeBg: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
      onClick: () => navigate("/einvoice"),
    },
    {
      key: "pending_eway",
      group: "tax",
      label: "Pending E-Way Bills",
      subtitle: "Awaiting generation",
      value: data.pending_eway_bills,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V11.25m-9 0h3.375c.621 0 1.125.504 1.125 1.125v8.25m-6.75-11.25h.008v.008h-.008V8.25zm-3 0h.008v.008h-.008V8.25z" />
        </svg>
      ),
      iconBg: "bg-teal-100 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400",
      badgeBg: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400",
      onClick: () => navigate("/eway-bill"),
    },
    {
      key: "failed_eway",
      group: "tax",
      label: "Failed E-Way Bills",
      subtitle: "Requires retry",
      value: data.failed_eway_bills,
      urgent: true,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
      iconBg: "bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
      badgeBg: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
      onClick: () => navigate("/eway-bill"),
    },
  ];

  // Hide zero-count items, then group by category
  const visible = items.filter((i) => i.value > 0);
  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    items: visible.filter((i) => i.group === key),
  })).filter((g) => g.items.length > 0);

  const totalPending = visible.length;
  const urgentCount = visible.filter((i) => i.urgent).length;

  if (!hasAnyPending) return null;

  return (
    <div className={`${cardShell} flex h-full w-full flex-col p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Pending Actions</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {urgentCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              {urgentCount} need attention
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-[#282832] dark:text-[#94a3b8]">
            {totalPending} pending
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">
              {group.label}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.items.map((item) => (
                <button
                  key={item.key}
                  onClick={item.onClick}
                  className={`${rowInteractive} min-w-0`}
                >
                  <div className={`${iconTile} ${item.iconBg}`}>
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">{item.label}</p>
                    <p className="text-xs text-slate-500 dark:text-[#64748b]">{item.subtitle}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${item.badgeBg}`}>
                    {item.isCurrency ? `₹${fmt(item.value)}` : item.value}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate("/payments")}
        className="mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:text-[#64748b] dark:hover:bg-[#1a1a24]"
      >
        View All
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}
