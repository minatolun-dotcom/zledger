import { toDisplayDate } from "../../utils/dateUtils";
import { StockAgeingData, ReportBaseProps, fmt, PreviewBtn } from "./shared";

export default function StockAgeingReport({ data, onPreview, onDownload }: ReportBaseProps & { data: StockAgeingData }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">How long items have been in stock</p>
        <div className="flex gap-2">
          <PreviewBtn onClick={() => onPreview("/reports/stock-ageing/pdf", "Stock Ageing")} />
          <button onClick={() => onDownload("/reports/stock-ageing/pdf", "stock-ageing.pdf")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download PDF</button>
          <button onClick={() => onDownload("/reports/stock-ageing/xlsx", "stock-ageing.xlsx")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download Excel</button>
        </div>
      </div>
      {data.lines.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-[#64748b]">No stock items found.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
              <th className="pb-1">Item</th>
              <th className="pb-1 text-right">Quantity</th>
              <th className="pb-1 text-right">Avg Rate (₹)</th>
              <th className="pb-1 text-right">Value (₹)</th>
              <th className="pb-1">Last Entry</th>
              <th className="pb-1 text-right">Days</th>
              <th className="pb-1">Ageing</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.stock_item_id} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                <td className="py-1 font-medium">{l.stock_item_name}</td>
                <td className="py-1 text-right">{l.quantity.toFixed(3)}</td>
                <td className="py-1 text-right">₹{fmt(l.avg_rate)}</td>
                <td className="py-1 text-right">₹{fmt(l.total_value)}</td>
                <td className="py-1 text-slate-500 dark:text-[#cbd5e1]">{l.last_entry_date ? toDisplayDate(l.last_entry_date) : "—"}</td>
                <td className="py-1 text-right">{l.days_since_entry ?? "—"}</td>
                <td className="py-1">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    l.ageing_bucket === "0-30 days" ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : l.ageing_bucket === "31-60 days" ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : l.ageing_bucket === "61-90 days" ? "bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400"
                    : l.ageing_bucket === "90+ days" ? "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400"
                    : "bg-slate-100 dark:bg-[#282832] text-slate-500 dark:text-[#cbd5e1]"
                  }`}>
                    {l.ageing_bucket}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-[#282832] font-medium">
              <td className="py-1">Total</td>
              <td className="py-1 text-right">{data.total_quantity.toFixed(3)}</td>
              <td></td>
              <td className="py-1 text-right">₹{fmt(data.total_value)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
