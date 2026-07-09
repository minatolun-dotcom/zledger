import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api/client";
import { useFyStore } from "../store/fy";
import { useToastStore } from "../store/toast";
import { generateFyName, calculateEndDate } from "../utils/dateUtils";
import { DashboardSkeleton } from "./skeletons";
import DateInput from "../components/DateInput";
import ManufacturingWidgets from "./ManufacturingWidgets";
import PendingActions from "./PendingActions";
import IncomeVsExpensesChart from "./IncomeVsExpensesChart";

interface FinancialYear { id: string; name: string; start_date: string; end_date: string; is_closed: boolean; }

interface DashboardData {
  financial_year_id: string; financial_year_name: string;
  total_income: number; total_expenses: number; net_profit: number; is_profit: boolean;
  total_assets: number; total_liabilities: number;
  voucher_count: number; sales_count: number; purchase_count: number;
  receipt_count: number; payment_count: number; journal_count: number;
  recent_vouchers: { id: string; voucher_type: string; voucher_number: string; voucher_date: string; narration: string | null; }[];
  ledger_count: number; party_count: number; group_count: number; gst_registration_count: number;
}

interface CompanyDetails {
  id: string; name: string; gstin: string | null; legal_name: string | null;
  state_code: string | null; is_active: boolean; logo_url: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="group rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25] dark:hover:border-[#282832]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${color || "text-slate-900"} dark:text-[#f1f5f9]`}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-[#cbd5e1]">{sub}</p>}
        </div>
        {icon && (
          <div className="rounded-lg bg-slate-100 p-2 opacity-60 transition-opacity group-hover:opacity-100 dark:bg-[#282832]">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardContent() {
  const { companyDetails, logoVersion } = useOutletContext<{ companyDetails: CompanyDetails | null; logoVersion: number }>();
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFyForm, setShowFyForm] = useState(false);
  const [fyStart, setFyStart] = useState("");
  const [fyEnd, setFyEnd] = useState("");
  const toast = useToastStore();
  const { activeFyId, setActiveFy } = useFyStore();
  const navigate = useNavigate();

  const handleStartDateChange = (value: string) => {
    setFyStart(value);
    if (value) {
      setFyEnd(calculateEndDate(value));
    } else {
      setFyEnd("");
    }
  };

  const loadFys = () => {
    api.get<FinancialYear[]>("/coa/financial-years").then((fys) => {
      setFys(fys);
      if (fys.length > 0 && (!activeFyId || !fys.some((f) => f.id === activeFyId))) {
        const latest = fys[fys.length - 1];
        setActiveFy(latest.id);
      } else if (fys.length === 0) {
        setActiveFy(null);
      }
    });
  };

  useEffect(() => { loadFys(); }, []);

  useEffect(() => {
    if (!activeFyId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    api.get<DashboardData>(`/dashboard/summary?financial_year_id=${activeFyId}`)
      .then(setData)
      .catch(() => { if (!controller.signal.aborted) setData(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeFyId]);

  const handleCreateFy = async () => {
    if (!fyStart || !fyEnd) { toast.error("Start and end dates are required"); return; }
    if (fyEnd < fyStart) { toast.error("End date cannot be before start date"); return; }
    try {
      const fyName = generateFyName(fyStart);
      const fy = await api.post<FinancialYear>("/coa/financial-years", {
        name: fyName, start_date: fyStart, end_date: fyEnd,
      });
      setActiveFy(fy.id);
      setShowFyForm(false);
      setFyStart(""); setFyEnd("");
      loadFys();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create financial year");
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (!activeFyId || fys.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-[#282832] dark:bg-[#16161f]">
        <h3 className="text-lg font-semibold text-slate-700 dark:text-[#cbd5e1]">Welcome to Zledger</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-[#cbd5e1]">
          {fys.length === 0
            ? "Create a Financial Year to get started."
            : "Select a Financial Year from the sidebar dropdown."}
        </p>
        {fys.length === 0 && !showFyForm && (
          <button onClick={() => setShowFyForm(true)}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Create Financial Year
          </button>
        )}
        {showFyForm && (
          <div className="mx-auto mt-4 max-w-sm text-left">
            <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25]">
              <h4 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">New Financial Year</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Start Date *</label>
                    <DateInput value={fyStart} onChange={handleStartDateChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#282832]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">End Date *</label>
                    <DateInput value={fyEnd} onChange={(v) => setFyEnd(v)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#282832]" />
                  </div>
                </div>
                {fyStart && fyEnd && (
                  <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">FY Name: {generateFyName(fyStart)}</p>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={handleCreateFy}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                  Create
                </button>
                <button onClick={() => setShowFyForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!data) return <p className="text-sm text-slate-500 dark:text-[#cbd5e1]">No data available.</p>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-[#1a1a24] pb-3">
        <div className="flex items-center gap-3">
          {companyDetails?.logo_url && (
            <img
              src={`${companyDetails.logo_url}${companyDetails.logo_url.includes("?") ? "&" : "?"}v=${logoVersion}`}
              alt={companyDetails.name}
              className="h-7 w-7 rounded-lg object-contain shadow-sm"
            />
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Dashboard</h2>
            {companyDetails?.name && (
              <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">Welcome to {companyDetails.name}</p>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Income"
          value={`₹${fmt(data.total_income)}`}
          color="text-emerald-700 dark:text-emerald-400"
          icon={<svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          label="Total Expenses"
          value={`₹${fmt(data.total_expenses)}`}
          color="text-red-600 dark:text-red-400"
          icon={<svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>}
        />
        <StatCard
          label={data.is_profit ? "Net Profit" : "Net Loss"}
          value={`₹${fmt(Math.abs(data.net_profit))}`}
          color={data.is_profit ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}
          icon={data.is_profit
            ? <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
            : <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 015.572 5.572l2.7 1.2m0 0l-5.94 2.28m5.94-2.28l-2.28-5.941" /></svg>}
        />
        <StatCard
          label="Total Assets"
          value={`₹${fmt(data.total_assets)}`}
          icon={<svg className="h-5 w-5 text-slate-500 dark:text-[#cbd5e1]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>}
        />
      </div>

      {/* Two-column layout: Pending Actions + Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Pending Actions — left column */}
        <div className="lg:col-span-2">
          <PendingActions />
        </div>

        {/* Trend Chart — right column */}
        <div className="lg:col-span-3">
          <IncomeVsExpensesChart />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25]">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button onClick={() => navigate("/vouchers")}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-sm dark:border-[#1a1a24] dark:text-[#cbd5e1] dark:hover:border-blue-800 dark:hover:bg-blue-500/5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 transition-colors group-hover:bg-blue-200 dark:bg-blue-500/10 dark:text-blue-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </span>
            Create Voucher
          </button>
          <button onClick={() => navigate("/reports")}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/50 hover:shadow-sm dark:border-[#1a1a24] dark:text-[#cbd5e1] dark:hover:border-emerald-800 dark:hover:bg-emerald-500/5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            </span>
            View Reports
          </button>
          <button onClick={() => navigate("/compliance")}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50/50 hover:shadow-sm dark:border-[#1a1a24] dark:text-[#cbd5e1] dark:hover:border-amber-800 dark:hover:bg-amber-500/5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 transition-colors group-hover:bg-amber-200 dark:bg-amber-500/10 dark:text-amber-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            </span>
            GST Compliance
          </button>
          <button onClick={() => navigate("/chart-of-accounts")}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/50 hover:shadow-sm dark:border-[#1a1a24] dark:text-[#cbd5e1] dark:hover:border-violet-800 dark:hover:bg-violet-500/5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 transition-colors group-hover:bg-violet-200 dark:bg-violet-500/10 dark:text-violet-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
            </span>
            Manage Accounts
          </button>
        </div>
      </div>

      {/* Manufacturing Widgets */}
      <ManufacturingWidgets />
    </div>
  );
}
