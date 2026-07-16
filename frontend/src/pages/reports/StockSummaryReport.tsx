import { StockSummaryData, ReportBaseProps, fmt, PreviewBtn } from "./shared";

export default function StockSummaryReport({ data, onPreview, onDownload }: ReportBaseProps & { data: StockSummaryData }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">Current stock balances</p>
        <div className="flex gap-2">
          <PreviewBtn onClick={() => onPreview("/reports/stock-summary/pdf", "Stock Summary")} />
          <button onClick={() => onDownload("/reports/stock-summary/pdf", "stock-summary.pdf")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download PDF</button>
          <button onClick={() => onDownload("/reports/stock-summary/xlsx", "stock-summary.xlsx")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download Excel</button>
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
              <th className="pb-1 text-right">Total Value (₹)</th>
              <th className="pb-1">Valuation</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.stock_item_id} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                <td className="py-1 font-medium">{l.stock_item_name}</td>
                <td className="py-1 text-right">{l.quantity.toFixed(3)}</td>
                <td className="py-1 text-right">₹{fmt(l.avg_rate)}</td>
                <td className="py-1 text-right">₹{fmt(l.total_value)}</td>
                <td className="py-1 text-xs text-slate-500 dark:text-[#cbd5e1]">{l.valuation_method === "weighted_avg" ? "Weighted Avg" : "FIFO"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-[#282832] font-medium">
              <td className="py-1">Total</td>
              <td className="py-1 text-right">{data.total_quantity.toFixed(3)}</td>
              <td></td>
              <td className="py-1 text-right">₹{fmt(data.total_value)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
