import { CashFlowData, ReportBaseProps, fmt, ReportHeader, ReportActions } from "./shared";

export default function CashFlowReport({ data, onPreview, onDownload }: ReportBaseProps & { data: CashFlowData }) {
  return (
    <div>
      <ReportHeader data={data} />
      <ReportActions report="cash-flow" financialYearId={data.financial_year_id} title={`Cash Flow — ${data.financial_year_name}`} onPreview={onPreview} onDownload={onDownload} />
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] px-3 py-2">
          <span className="text-slate-500 dark:text-[#cbd5e1]">Opening Balance</span>
          <p className="text-lg font-bold">₹{fmt(data.opening_balance)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] px-3 py-2">
          <span className="text-slate-500 dark:text-[#cbd5e1]">Net Increase</span>
          <p className={`text-lg font-bold ${data.net_increase >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
            ₹{fmt(Math.abs(data.net_increase))}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] px-3 py-2">
          <span className="text-slate-500 dark:text-[#cbd5e1]">Closing Balance</span>
          <p className="text-lg font-bold">₹{fmt(data.closing_balance)}</p>
        </div>
      </div>
      {[data.operating, data.investing, data.financing].map((cat) => (
        <div key={cat.category} className="mb-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">{cat.category}</h3>
          {cat.lines.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-[#64748b]">No transactions.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                  <th className="pb-1">Account</th>
                  <th className="pb-1 text-right">Inflow (₹)</th>
                  <th className="pb-1 text-right">Outflow (₹)</th>
                  <th className="pb-1 text-right">Net (₹)</th>
                </tr>
              </thead>
              <tbody>
                {cat.lines.map((l) => (
                  <tr key={l.label} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                    <td className="py-1">{l.label}</td>
                    <td className="py-1 text-right">{l.inflow > 0 ? `₹${fmt(l.inflow)}` : ""}</td>
                    <td className="py-1 text-right">{l.outflow > 0 ? `₹${fmt(l.outflow)}` : ""}</td>
                    <td className="py-1 text-right font-medium">₹{fmt(l.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-[#282832] font-medium">
                  <td className="py-1">Total {cat.category}</td>
                  <td className="py-1 text-right">₹{fmt(cat.total_inflow)}</td>
                  <td className="py-1 text-right">₹{fmt(cat.total_outflow)}</td>
                  <td className="py-1 text-right">₹{fmt(cat.net)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}