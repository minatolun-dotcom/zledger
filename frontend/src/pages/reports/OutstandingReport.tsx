import { toDisplayDate } from "../../utils/dateUtils";
import { OutstandingData, ReportBaseProps, fmt, PreviewBtn } from "./shared";

export default function OutstandingReport({ data, onPreview, onDownload }: ReportBaseProps & { data: OutstandingData }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">
          {data.financial_year_name} — {toDisplayDate(data.start_date)} to {toDisplayDate(data.end_date)}
        </p>
        <div className="flex gap-2">
          <PreviewBtn onClick={() => onPreview(`/reports/outstanding/pdf?financial_year_id=${data.financial_year_id}`, `Outstanding — ${data.financial_year_name}`)} />
          <button onClick={() => onDownload(`/reports/outstanding/pdf?financial_year_id=${data.financial_year_id}`, `outstanding-${data.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download PDF</button>
          <button onClick={() => onDownload(`/reports/outstanding/xlsx?financial_year_id=${data.financial_year_id}`, `outstanding-${data.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Download Excel</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
            Debtors ({data.debtors.length}) — Total: ₹{fmt(data.total_debtors)}
          </h3>
          {data.debtors.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-[#64748b]">No debtors.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                  <th className="pb-1">Party</th>
                  <th className="pb-1 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.debtors.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                    <td className="py-1">{d.party_name}</td>
                    <td className="py-1 text-right">₹{fmt(d.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
            Creditors ({data.creditors.length}) — Total: ₹{fmt(data.total_creditors)}
          </h3>
          {data.creditors.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-[#64748b]">No creditors.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                  <th className="pb-1">Party</th>
                  <th className="pb-1 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.creditors.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                    <td className="py-1">{c.party_name}</td>
                    <td className="py-1 text-right">₹{fmt(c.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
