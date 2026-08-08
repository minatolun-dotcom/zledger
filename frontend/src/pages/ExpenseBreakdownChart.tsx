import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useFyStore } from "../store/fy";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { cardShell } from "./dashboardShell";

interface ExpenseGroup {
  group_name: string;
  group_id: string;
  total_expense: number;
}

const DONUT_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

const fmt0 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmt2 = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-[#282832] dark:bg-[#1a1a24]/95">
      <p className="font-semibold text-slate-700 dark:text-[#f1f5f9]">{item.name}</p>
      <p className="tabular-nums text-slate-500 dark:text-[#94a3b8]">₹{fmt2(item.value)}</p>
    </div>
  );
}

export default function ExpenseBreakdownChart() {
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { activeFyId } = useFyStore();

  useEffect(() => {
    if (!activeFyId) return;
    setLoaded(false);
    api
      .get<{ success: boolean; data: { expense_by_group: ExpenseGroup[] } }>(
        `/dashboard/expense-analysis?financial_year_id=${activeFyId}`
      )
      .then((res) => {
        const list = (res?.data?.expense_by_group ?? []).filter((g) => g.total_expense > 0);
        if (!list.length) {
          setGroups([]);
          return;
        }
        // Top 6 slices; the remainder folds into "Other".
        const top = list.slice(0, 6).map((g) => ({ ...g }));
        const restTotal = list.slice(6).reduce((s, g) => s + g.total_expense, 0);
        if (restTotal > 0) top.push({ group_name: "Other", group_id: "__other__", total_expense: restTotal });
        setGroups(top);
      })
      .catch(() => setGroups([]))
      .finally(() => setLoaded(true));
  }, [activeFyId]);

  if (!loaded) return null;

  // Empty state keeps the grid balanced when there are no expenses yet.
  if (groups.length === 0) {
    return (
      <div className={`${cardShell} flex h-full w-full flex-col p-4`}>
        <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
          Expense Breakdown
        </p>
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-[#1a1a24] dark:text-[#64748b]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
            </svg>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">No expense data yet</p>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-[#64748b]">
            Post purchase or expense vouchers to see the split.
          </p>
        </div>
      </div>
    );
  }

  const total = groups.reduce((s, g) => s + g.total_expense, 0);

  return (
    <div className={`${cardShell} flex h-full w-full flex-col p-4`}>
      <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
        Expense Breakdown
      </p>

      {/* Donut */}
      <div className="relative mx-auto h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={groups}
              dataKey="total_expense"
              nameKey="group_name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={2}
              cornerRadius={4}
              stroke="none"
              isAnimationActive
            >
              {groups.map((g, i) => (
                <Cell key={g.group_id} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">
            Total
          </p>
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-[#f1f5f9]">
            ₹{fmt0(total)}
          </p>
        </div>
      </div>

      {/* Legend */}
      <ul className="mt-4 space-y-1.5">
        {groups.map((g, i) => (
          <li key={g.group_id} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[4px]"
              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-[#cbd5e1]">
              {g.group_name}
            </span>
            <span className="tabular-nums font-semibold text-slate-700 dark:text-[#f1f5f9]">
              ₹{fmt0(g.total_expense)}
            </span>
            <span className="w-11 text-right tabular-nums text-slate-400 dark:text-[#64748b]">
              {total ? ((g.total_expense / total) * 100).toFixed(0) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
