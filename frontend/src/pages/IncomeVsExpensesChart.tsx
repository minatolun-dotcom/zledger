import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { cardShell } from "./dashboardShell";

interface ChartDataPoint {
  month: string;
  income: number;
  expenses: number;
}

/** Minimum visible window (months) when zooming in. */
const MIN_WIN = 3;
const ZOOM_STEP = 2;

/** Persisted view state — survives navigation/refresh (matches zledger.* convention). */
const CHART_WIN_KEY = "zledger.dashboardChartWin";

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

const PRESETS = [
  { months: 3, label: "3M" },
  { months: 6, label: "6M" },
  { months: 12, label: "12M" },
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
  // Visible window as [start, end] indices into `data`. null until data loads.
  const [win, setWin] = useState<[number, number] | null>(null);
  const [dragging, setDragging] = useState(false);
  const { activeFyId } = useFyStore();

  const chartWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWin: [number, number] } | null>(null);
  const winRef = useRef(win);
  winRef.current = win;
  const dataRef = useRef(data);
  dataRef.current = data;
  // The FY the current `win` was computed for. Keeps a stale window from one FY
  // leaking into another (partial FYs have fewer months — an old window could
  // be out of bounds and render a blank chart).
  const winFyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeFyId) return;
    api
      .get<ChartDataPoint[]>(`/dashboard/chart-data?financial_year_id=${activeFyId}`)
      .then((rows) => {
        setData(rows);
        // Initialize the window with the data so there is no empty-chart
        // flash. Default is the whole FY; if the user previously zoomed/panned
        // this same FY, restore that view (validated against the fresh data).
        setWin((prev) => {
          // Only carry over the live window when it belongs to this same FY —
          // otherwise re-validate from scratch (a shorter/partial FY would
          // otherwise keep an out-of-bounds window and render a blank chart).
          if (prev && winFyRef.current === activeFyId) return prev;
          winFyRef.current = activeFyId;
          try {
            // Storage shape: { [fyId]: [start, end] } — one remembered view per FY.
            const saved = JSON.parse(localStorage.getItem(CHART_WIN_KEY) || "null") || {};
            const winForFy = saved[activeFyId];
            if (Array.isArray(winForFy)) {
              const [s, e] = winForFy as [number, number];
              if (
                Number.isInteger(s) && Number.isInteger(e) &&
                s >= 0 && e < rows.length && e - s + 1 >= MIN_WIN && e - s + 1 <= rows.length
              ) {
                return [s, e];
              }
            }
          } catch { /* corrupted entry — fall through to full year */ }
          return [Math.max(0, rows.length - 12), rows.length - 1];
        });
      })
      .catch(() => {});
  }, [activeFyId]);

  // Persist the current view per FY so it survives navigation/refresh and is
  // remembered independently for each FY. Skip while `win` still belongs to a
  // previous FY (between an FY switch and the new data resolving) — writing
  // then would key the old window to the new FY.
  useEffect(() => {
    if (!win || !data.length || !activeFyId) return;
    if (winFyRef.current !== activeFyId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(CHART_WIN_KEY) || "null") || {};
      saved[activeFyId] = win;
      localStorage.setItem(CHART_WIN_KEY, JSON.stringify(saved));
    } catch { /* storage full/blocked — non-fatal */ }
  }, [win, data.length, activeFyId]);

  // ── Scroll-to-zoom (native non-passive listener so preventDefault works) ──
  const handleWheel = useCallback((e: WheelEvent) => {
    const el = chartWrapRef.current;
    const cur = winRef.current;
    const rows = dataRef.current;
    if (!el || !cur || rows.length < MIN_WIN) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const visible = cur[1] - cur[0] + 1;
    const nextVisible =
      e.deltaY < 0
        ? Math.max(MIN_WIN, visible - ZOOM_STEP)
        : Math.min(rows.length, visible + ZOOM_STEP);
    if (nextVisible === visible) return;
    // Keep the month under the cursor anchored while the window shrinks/grows.
    const anchor = cur[0] + ratio * (visible - 1);
    const start = Math.max(0, Math.min(Math.round(anchor - ratio * (nextVisible - 1)), rows.length - nextVisible));
    setWin([start, start + nextVisible - 1]);
  }, []);

  // The chart wrapper only exists after data loads (early `return null`), so
  // the wheel listener must re-attach when data arrives — depending on
  // handleWheel alone would attach on first render when the div is absent.
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleWheel, data.length]);

  // ── Drag-to-pan ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (!winRef.current) return;
    dragRef.current = { startX: e.clientX, startWin: winRef.current };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = chartWrapRef.current;
    const rows = dataRef.current;
    if (!drag || !el || !rows.length) return;
    // Accumulate against the ORIGINAL start of the gesture — resetting startX
    // per move would let Math.round swallow the small per-event deltas of a
    // slow drag (pan would barely move).
    const visible = drag.startWin[1] - drag.startWin[0] + 1;
    const pxPerMonth = el.getBoundingClientRect().width / visible;
    const delta = Math.round((e.clientX - drag.startX) / pxPerMonth);
    if (delta === 0) return;
    const start = Math.max(0, Math.min(drag.startWin[0] - delta, rows.length - visible));
    setWin([start, start + visible - 1]);
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  // ── Keyboard (active while the chart wrapper is focused) ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = winRef.current;
    const rows = dataRef.current;
    if (!cur || !rows.length) return;
    const visible = cur[1] - cur[0] + 1;
    switch (e.key) {
      case "ArrowLeft": {
        e.preventDefault();
        e.stopPropagation();
        if (cur[0] > 0) setWin([cur[0] - 1, cur[1] - 1]);
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        e.stopPropagation();
        if (cur[1] < rows.length - 1) setWin([cur[0] + 1, cur[1] + 1]);
        break;
      }
      case "+":
      case "=": {
        e.preventDefault();
        e.stopPropagation();
        const next = Math.max(MIN_WIN, visible - ZOOM_STEP);
        if (next !== visible) setWin([cur[0], cur[0] + next - 1]);
        break;
      }
      case "-":
      case "_": {
        e.preventDefault();
        e.stopPropagation();
        const next = Math.min(rows.length, visible + ZOOM_STEP);
        if (next !== visible) {
          // Clamp the left edge so the window never overflows the data
          // (zooming out after a right pan must not push end past the last month).
          const start = Math.max(0, Math.min(cur[0], rows.length - next));
          setWin([start, start + next - 1]);
        }
        break;
      }
      case "r":
      case "R":
      case "Home": {
        e.preventDefault();
        e.stopPropagation();
        setWin([0, rows.length - 1]);
        break;
      }
      default:
        break;
    }
  };

  const sliced = useMemo(() => {
    if (!win || !data.length) return [];
    const [s, e] = win;
    return data.slice(s, e + 1).map((d) => ({ ...d, net: d.income - d.expenses }));
  }, [data, win]);

  if (!data.length) return null;

  const isFullRange = win ? win[0] === 0 && win[1] === data.length - 1 : true;
  const totals = sliced.reduce(
    (acc, d) => ({ income: acc.income + d.income, expenses: acc.expenses + d.expenses }),
    { income: 0, expenses: 0 }
  );

  return (
    <div className={`${cardShell} flex h-full w-full flex-col p-4`}>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
            Income vs Expenses
          </h3>
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

        {/* Preset chips + reset */}
        <div className="flex items-center gap-1.5">
          {PRESETS.map((p) => {
            const active = win
              ? win[0] === data.length - p.months && win[1] === data.length - 1
              : p.months === 12;
            return (
              <button
                key={p.label}
                onClick={() => setWin([Math.max(0, data.length - p.months), data.length - 1])}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-brand-600 text-white shadow-sm dark:bg-blue-600"
                    : "text-slate-500 hover:bg-slate-100 dark:text-[#94a3b8] dark:hover:bg-[#1a1a24]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          {!isFullRange && (
            <button
              onClick={() => setWin([0, data.length - 1])}
              className="ml-1 flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 dark:border-[#282832] dark:text-[#94a3b8] dark:hover:bg-[#1a1a24]"
              title="Reset to full financial year"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Chart (scroll to zoom, drag to pan, keys to navigate when focused) */}
      <div
        ref={chartWrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        role="group"
        aria-label="Income vs expenses chart. Use arrow keys to pan, plus or minus to zoom, R to reset."
        tabIndex={0}
        className={`min-h-64 flex-1 touch-none select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:focus-visible:ring-blue-500/30 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
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

      {/* Hint */}
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-[#64748b]">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        Scroll to zoom · Drag to pan · Keys when focused
        {sliced.length > 0 && (
          <span className="ml-auto tabular-nums">
            {sliced.length} {sliced.length === 1 ? "month" : "months"}
          </span>
        )}
      </p>
    </div>
  );
}
