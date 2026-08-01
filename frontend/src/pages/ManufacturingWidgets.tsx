import StatusBadge from "../components/StatusBadge";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface ManufacturingDashboard {
  total_boms: number;
  active_boms: number;
  draft_orders: number;
  in_progress_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_completed_cost: number;
  average_wastage_pct: number;
  recent_orders: {
    id: string;
    order_number: string;
    status: string;
    planned_qty: number;
    produced_qty: number;
    created_at: string;
  }[];
}

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function OrderBadge({ count, color }: { count: number; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>
      {count}
    </span>
  );
}


export default function ManufacturingWidgets({ showViewAll = true }: { showViewAll?: boolean }) {
  const [data, setData] = useState<ManufacturingDashboard | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<ManufacturingDashboard>("/manufacturing/dashboard").then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const totalOrders = data.draft_orders + data.in_progress_orders + data.completed_orders + data.cancelled_orders;

  return (
    <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Manufacturing</h3>
        {showViewAll && (
          <button
            onClick={() => navigate("/manufacturing")}
            className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
          >
            View All
          </button>
        )}
      </div>

      {/* Single-row KPI summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white p-2 dark:border-[#282832] dark:bg-[#1e1e28]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">BOMs</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{data.total_boms}</p>
              <span className="text-[11px] text-slate-500 dark:text-[#cbd5e1]">· {data.active_boms} active</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white p-2 dark:border-[#282832] dark:bg-[#1e1e28]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.243 1.007-2.25 2.25-2.25h13.5" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Orders</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{totalOrders}</p>
              <div className="flex gap-1" title={`${data.draft_orders} Draft · ${data.in_progress_orders} In Progress · ${data.completed_orders} Completed · ${data.cancelled_orders} Cancelled`}>
                <OrderBadge count={data.draft_orders} color="bg-slate-200 text-slate-700 dark:bg-[#16161f] dark:text-[#cbd5e1]" />
                <OrderBadge count={data.in_progress_orders} color="bg-amber-200 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" />
                <OrderBadge count={data.completed_orders} color="bg-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" />
                <OrderBadge count={data.cancelled_orders} color="bg-red-200 text-red-700 dark:bg-red-500/10 dark:text-red-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white p-2 dark:border-[#282832] dark:bg-[#1e1e28]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Total Cost</p>
            <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">₹{fmt(data.total_completed_cost)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white p-2 dark:border-[#282832] dark:bg-[#1e1e28]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Wastage</p>
            <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{data.average_wastage_pct.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      {data.recent_orders.length > 0 && (
        <div className="mt-3 border-t border-slate-100 dark:border-[#282832] pt-3">
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-[#cbd5e1]">Recent Orders</p>
          <div className="space-y-1.5">
            {data.recent_orders.slice(0, 5).map((order) => (
              <button
                key={order.id}
                onClick={() => navigate("/manufacturing", { state: { tab: "orders", orderId: order.id } })}
                className="flex w-full items-center justify-between rounded-lg bg-slate-50/80 px-3 py-2 text-left transition-colors hover:bg-slate-100 dark:bg-[#1e1e28] dark:hover:bg-[#282832]"
              >
                <div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-[#cbd5e1]">{order.order_number}</span>
                  <span className="ml-2 text-[11px] text-slate-500 dark:text-[#64748b]">
                    {order.produced_qty}/{order.planned_qty}
                  </span>
                </div>
                <StatusBadge status={order.status} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
