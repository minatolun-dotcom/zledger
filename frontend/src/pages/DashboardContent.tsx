import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api/client";
import { useFyStore } from "../store/fy";
import { useToastStore } from "../store/toast";
import { generateFyName, calculateEndDate, toDisplayDate } from "../utils/dateUtils";
import { DashboardSkeleton } from "./skeletons";
import DateInput from "../components/DateInput";
import PendingActions from "./PendingActions";
import ManufacturingWidgets from "./ManufacturingWidgets";
import IncomeVsExpensesChart from "./IncomeVsExpensesChart";
import ExpenseBreakdownChart from "./ExpenseBreakdownChart";
import QuickActions from "./QuickActions";
import SmartInsights, { useSmartInsights } from "./SmartInsights";
import { cardShell, iconTile } from "./dashboardShell";
import { VOUCHER_TYPES, getVoucherColor } from "./vouchers/types";

interface FinancialYear { id: string; name: string; start_date: string; end_date: string; is_closed: boolean; }

interface DashboardData {
  financial_year_id: string; financial_year_name: string;
  total_income: number; total_expenses: number; net_profit: number; is_profit: boolean;
  total_assets: number; total_liabilities: number;
  voucher_count: number; sales_count: number; purchase_count: number;
  receipt_count: number; payment_count: number; journal_count: number;
  recent_vouchers: { id: string; voucher_type: string; voucher_number: string; voucher_date: string; narration: string | null; }[];
  ledger_count: number; party_count: number; group_count: number; gst_registration_count: number;
  income_change_pct: number | null;
  expense_change_pct: number | null;
  profit_change_pct: number | null;
  assets_change_pct: number | null;
}

interface ChartDataPoint { month: string; income: number; expenses: number; }

interface CompanyDetails {
  id: string; name: string; gstin: string | null; legal_name: string | null;
  state_code: string | null; is_active: boolean; logo_url: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Trend chip ───────────────────────────────────────────────────────────
function TrendChip({ value }: { value: number | null }) {
  if (value === null) return null;
  const isPositive = value > 0;
  const isZero = value === 0;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        isZero
          ? "bg-slate-100 text-slate-500 dark:bg-[#282832] dark:text-[#94a3b8]"
          : isPositive
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
      }`}
    >
      {!isZero && (
        <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="currentColor">
          {isPositive ? <path d="M6 2L10 7H2L6 2Z" /> : <path d="M6 10L2 5H10L6 10Z" />}
        </svg>
      )}
      {isZero ? "—" : `${Math.abs(value).toFixed(1)}%`}
    </span>
  );
}

// ── Sparkline (gradient area) ────────────────────────────────────────────
function SparkLine({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 96;
  const height = 30;
  const pad = 3;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (height - 2 * pad);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const gid = `spark-${color.replace("#", "")}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon, iconBg, glow, trend, sparkData, sparkColor, sub, delay }: {
  label: string; value: string; color?: string; icon: React.ReactNode; iconBg: string; glow: string;
  trend?: number | null | undefined; sparkData?: number[]; sparkColor?: string; sub?: string; delay?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay ?? 0}ms` }}
      className={`${cardShell} group relative animate-fadeIn overflow-hidden p-4 hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-dark-lg`}
    >
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.07] blur-xl ${glow}`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">{label}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className={`truncate text-2xl font-bold tracking-tight tabular-nums ${color || "text-slate-900"} dark:text-[#f1f5f9]`}>{value}</p>
            <TrendChip value={trend ?? null} />
          </div>
          {sub && <p className="mt-1 text-[11px] text-slate-500 dark:text-[#94a3b8]">{sub}</p>}
        </div>
        <div className={`${iconTile} h-10 w-10 rounded-xl ${iconBg} transition-transform duration-300 group-hover:scale-110`}>
          {icon}
        </div>
      </div>
      {sparkData && sparkData.length >= 2 && (
        <div className="relative mt-3 opacity-70 transition-opacity duration-300 group-hover:opacity-100">
          <SparkLine data={sparkData} color={sparkColor || "#94a3b8"} />
        </div>
      )}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
const icons = {
  income: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  expenses: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  profit: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  ),
  assets: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  ),
  doc: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
};

export default function DashboardContent() {
  const { companyDetails, logoVersion } = useOutletContext<{ companyDetails: CompanyDetails | null; logoVersion: number }>();
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFyForm, setShowFyForm] = useState(false);
  const [fyStart, setFyStart] = useState("");
  const [fyEnd, setFyEnd] = useState("");
  const toast = useToastStore();
  const { activeFyId, setActiveFy } = useFyStore();
  const navigate = useNavigate();
  const { insights } = useSmartInsights();

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
    Promise.all([
      api.get<DashboardData>(`/dashboard/summary?financial_year_id=${activeFyId}`),
      api.get<ChartDataPoint[]>(`/dashboard/chart-data?financial_year_id=${activeFyId}`),
    ]).then(([summary, chart]) => {
      if (!controller.signal.aborted) {
        setData(summary);
        setChartData(chart);
      }
    }).catch(() => { if (!controller.signal.aborted) { setData(null); setChartData([]); } })
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
            <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm dark:border-[#1a1a24] dark:bg-[#16161f]">
              <h4 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">New Financial Year</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

  const activeFy = fys.find((f) => f.id === activeFyId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="sticky top-0 z-20 -mx-4 lg:-mx-8 border-b border-slate-200/60 dark:border-[#1a1a24] bg-white dark:bg-[#08080c] px-4 pt-2 pb-2 lg:px-8 lg:pt-3 lg:pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {companyDetails?.logo_url && (
              <img
                src={`${companyDetails.logo_url}${companyDetails.logo_url.includes("?") ? "&" : "?"}v=${logoVersion}`}
                alt={companyDetails.name}
                className="h-8 w-8 rounded-lg object-contain shadow-sm"
              />
            )}
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-[#f1f5f9]">Dashboard</h2>
              {companyDetails?.name && (
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Welcome to {companyDetails.name}</p>
              )}
            </div>
          </div>
          {activeFy && (
            <span className="hidden shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500 sm:inline-flex dark:border-[#282832] dark:bg-[#16161f] dark:text-[#94a3b8]">
              FY {activeFy.name}
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Income"
          value={`₹${fmt(data.total_income)}`}
          color="text-emerald-700 dark:text-emerald-400"
          icon={icons.income}
          iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          glow="bg-emerald-500"
          trend={data.income_change_pct ?? null}
          sparkData={chartData.map((d) => d.income)}
          sparkColor="#10b981"
          delay={0}
        />
        <StatCard
          label="Total Expenses"
          value={`₹${fmt(data.total_expenses)}`}
          color="text-rose-600 dark:text-rose-400"
          icon={icons.expenses}
          iconBg="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
          glow="bg-rose-500"
          trend={data.expense_change_pct ?? null}
          sparkData={chartData.map((d) => d.expenses)}
          sparkColor="#ef4444"
          delay={60}
        />
        <StatCard
          label={data.is_profit ? "Net Profit" : "Net Loss"}
          value={`₹${fmt(Math.abs(data.net_profit))}`}
          color={data.is_profit ? "text-indigo-700 dark:text-indigo-400" : "text-rose-700 dark:text-rose-400"}
          icon={icons.profit}
          iconBg={data.is_profit
            ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
            : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"}
          glow="bg-indigo-500"
          trend={data.profit_change_pct ?? null}
          sparkData={chartData.map((d) => d.income - d.expenses)}
          sparkColor={data.is_profit ? "#6366f1" : "#ef4444"}
          delay={120}
        />
        <StatCard
          label="Total Assets"
          value={`₹${fmt(data.total_assets)}`}
          color="text-blue-700 dark:text-blue-400"
          icon={icons.assets}
          iconBg="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
          glow="bg-blue-500"
          trend={data.assets_change_pct ?? null}
          delay={180}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="flex lg:col-span-3">
          <IncomeVsExpensesChart />
        </div>
        <div className="flex lg:col-span-2">
          <ExpenseBreakdownChart />
        </div>
      </div>

      {/* Smart Insights + Quick Actions (side by side) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {insights.length > 0 && (
          <div className="flex lg:col-span-3">
            <SmartInsights insights={insights} />
          </div>
        )}
        <div className={insights.length > 0 ? "flex lg:col-span-2" : "lg:col-span-5"}>
          <QuickActions compact={insights.length > 0} />
        </div>
      </div>

      {/* Pending Actions + Recent Vouchers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="flex lg:col-span-2">
          <PendingActions />
        </div>
        <div className={`${cardShell} flex w-full flex-col p-4 lg:col-span-3`}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Recent Vouchers</p>
            <button
              onClick={() => navigate("/vouchers?tab=daybook")}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 transition-colors hover:text-brand-600 dark:text-[#94a3b8] dark:hover:text-blue-400"
            >
              View Day Book
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
          <div className="flex-1 space-y-2">
            {data.recent_vouchers.length === 0 ? (
              <div className="flex h-full min-h-24 flex-col items-center justify-center text-center">
                <div className="mb-2 text-slate-300 dark:text-[#475569]">{icons.doc}</div>
                <p className="text-xs text-slate-400 dark:text-[#64748b]">No vouchers recorded yet</p>
              </div>
            ) : (
              data.recent_vouchers.map((v) => {
                const color = getVoucherColor(v.voucher_type);
                const label = VOUCHER_TYPES.find((t) => t.id === v.voucher_type)?.shortLabel || v.voucher_type;
                return (
                  <button
                    key={v.id}
                    onClick={() => navigate("/vouchers?tab=daybook")}
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
                  >
                    <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${color.bg} ${color.text}`}>
                      {label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-700 dark:text-[#e2e8f0]">
                        {v.narration || v.voucher_number}
                      </span>
                      <span className="block text-[10px] text-slate-400 dark:text-[#64748b]">
                        {v.voucher_number} · {toDisplayDate(v.voucher_date)}
                      </span>
                    </span>
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Manufacturing Widgets */}
      <ManufacturingWidgets />
    </div>
  );
}
