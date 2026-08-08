import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useFyStore } from "../store/fy";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Select from "../components/Select";
import { cardShell } from "./dashboardShell";

interface ChartDataPoint {
  month: string;
  income: number;
  expenses: number;
}

type TimePeriod = "12" | "6" | "3";

const fmt0 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Compact INR for axis ticks: ₹1.2L, ₹3.4 Cr, ₹8.5k */
function compactINR(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  if (abs >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
}

const shortMonth = (label: string) => label.split(" ")[0].slice(0, 3);

const LEGEND = [
  { key: "income", label: "Income", dot: "bg-emerald-500" },
  { key: "expenses", label: "Expenses", dot: "bg-rose-500" },
  { key: "net", label: "Net", dot: "bg-indigo-500" },
] as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income = payload.find((p: any) => p.dataKey === "income")?.value ?? 0;
  const expenses = payload.find((p: any) => p.dataKey === "expenses")?.value ?? 0;
  const net = income - expenses;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur dark:border-[#282832] dark:bg-[#1a1a24]/95">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-[#64748b]">
        {label}
      </p>
      <div className="space-y-1 text-xs">
        <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Income
          <span className="ml-auto pl-4 font-semibold tabular-nums">₹{fmt0(income)}</span>
        </p>
        <p className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> Expenses
          <span className="ml-auto pl-4 font-semibold tabular-nums">₹{fmt0(expenses)}</span>
        </p>
        <p className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
          <span className="h-2 w-2 rounded-full bg-indigo-500" /> Net
          <span className="ml-auto pl-4 font-semibold tabular-nums">₹{fmt0(net)}</span>
        </p>
      </div>
    </div>
  );
}

export default function IncomeVsExpensesChart() {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [period, setPeriod] = useState<TimePeriod>("12");
  const { activeFyId } = useFyStore();

  useEffect(() => {
    if (!activeFyId) return;
    api
      .get<ChartDataPoint[]>(`/dashboard/chart-data?financial_year_id=${activeFyId}`)
      .then(setData)
      .catch(() => {});
  }, [activeFyId]);

  const sliced = useMemo(() => {
    const base = data.slice(-Number(period));
    return base.map((d) => ({ ...d, net: d.income - d.expenses }));
  }, [data, period]);

  if (!data.length) return null;

  const totals = sliced.reduce(
    (acc, d) => ({ income: acc.income + d.income, expenses: acc.expenses + d.expenses }),
    { income: 0, expenses: 0 }
  );

  return (
    <div className={`${cardShell} flex h-full w-full flex-col p-4`}>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
            Income vs Expenses
          </h3>
          {/* legend chips */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-slate-500 dark:text-[#94a3b8]">
            {LEGEND.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${l.dot}`} />
                {l.label}
                <b className="tabular-nums text-slate-800 dark:text-[#f1f5f9]">
                  {l.key === "net"
                    ? `₹${fmt0(totals.income - totals.expenses)}`
                    : `₹${fmt0(l.key === "income" ? totals.income : totals.expenses)}`}
                </b>
              </span>
            ))}
          </div>
        </div>
        <Select
          value={period}
          onChange={(v) => setPeriod(v as TimePeriod)}
          options={[
            { value: "12", label: "Last 12 Months" },
            { value: "6", label: "Last 6 Months" },
            { value: "3", label: "Last 3 Months" },
          ]}
        />
      </div>

      {/* Chart */}
      <div className="min-h-64 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sliced} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dashGradIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="dashGradExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="#e2e8f0"
              vertical={false}
              className="dark:stroke-[#282832]"
            />
            <XAxis
              dataKey="month"
              tickFormatter={shortMonth}
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              dy={4}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={compactINR}
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }} />
            <Area
              type="monotone"
              dataKey="income"
              name="Income"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#dashGradIncome)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke="#ef4444"
              strokeWidth={2.5}
              fill="url(#dashGradExpense)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Net"
              stroke="#6366f1"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 2, stroke: "#fff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
