import { StockMovementData, ReportBaseProps, fmt, PreviewBtn } from "./shared";

export default function StockMovementReport({ data, onPreview, onDownload }: ReportBaseProps & { data: StockMovementData }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">Opening / Inward / Outward / Closing</p>
        <div className="flex gap-2">
          <PreviewBtn onClick={() => onPreview("/reports/stock-movement/pdf", "Stock Movement")} />
          <button onClick={() => onDownload("/reports/stock-movement/pdf", "stock-movement.pdf")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download PDF</button>
          <button onClick={() => onDownload("/reports/stock-movement/xlsx", "stock-movement.xlsx")} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download Excel</button>
        </div>
      </div>
      {data.lines.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-[#64748b]">No stock items found.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
              <th className="pb-1">Item</th>
              <th className="pb-1 text-right">Opening Qty</th>
              <th className="pb-1 text-right">Inward Qty</th>
              <th className="pb-1 text-right">Outward Qty</th>
              <th className="pb-1 text-right">Closing Qty</th>
              <th className="pb-1 text-right">Closing Value (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.stock_item_id} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                <td className="py-1 font-medium">{l.stock_item_name}</td>
                <td className="py-1 text-right">{l.opening_qty.toFixed(3)}</td>
                <td className="py-1 text-right text-emerald-600 dark:text-emerald-400">{l.inward_qty.toFixed(3)}</td>
                <td className="py-1 text-right text-red-600 dark:text-red-400">{l.outward_qty.toFixed(3)}</td>
                <td className="py-1 text-right font-medium">{l.closing_qty.toFixed(3)}</td>
                <td className="py-1 text-right">₹{fmt(l.closing_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
