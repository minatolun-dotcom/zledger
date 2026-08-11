import { toDisplayDate } from "../../utils/dateUtils";
import { TdsTcsSummaryData, Tab, fmt, PreviewBtn } from "./shared";

interface TdsTcsReportProps {
  data: TdsTcsSummaryData;
  tdsTcsType: string;
  onTdsTcsTypeChange: (t: string) => void;
  onFetchReport: (tab: Tab, fyId: string, subType: string) => void;
  selectedFy: string | null;
  onPreview: (url: string, title: string) => void;
  onDownload: (path: string, filename: string) => void;
}

export default function TdsTcsReport({ data, tdsTcsType, onTdsTcsTypeChange, onFetchReport, selectedFy, onPreview, onDownload }: TdsTcsReportProps) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">
          {data.financial_year_name} — {toDisplayDate(data.start_date)} to {toDisplayDate(data.end_date)}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { onTdsTcsTypeChange("tds"); if (selectedFy) onFetchReport("tds-tcs", selectedFy, "tds"); }}
            className={`rounded-lg border px-3 py-1 text-xs font-medium ${
              tdsTcsType === "tds"
                ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            }`}
          >
            TDS
          </button>
          <button
            onClick={() => { onTdsTcsTypeChange("tcs"); if (selectedFy) onFetchReport("tds-tcs", selectedFy, "tcs"); }}
            className={`rounded-lg border px-3 py-1 text-xs font-medium ${
              tdsTcsType === "tcs"
                ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            }`}
          >
            TCS
          </button>
          <PreviewBtn onClick={() => onPreview(`/reports/tds-tcs-summary/pdf?financial_year_id=${data.financial_year_id}&tds_tcs_type=${tdsTcsType}`, `${tdsTcsType.toUpperCase()} Summary — ${data.financial_year_name}`)} />
          <button onClick={() => onDownload(`/reports/tds-tcs-summary/pdf?financial_year_id=${data.financial_year_id}&tds_tcs_type=${tdsTcsType}`, `${tdsTcsType}-summary-${data.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">PDF</button>
          <button onClick={() => onDownload(`/reports/tds-tcs-summary/xlsx?financial_year_id=${data.financial_year_id}&tds_tcs_type=${tdsTcsType}`, `${tdsTcsType}-summary-${data.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Excel</button>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] px-3 py-2">
          <span className="text-slate-500 dark:text-[#cbd5e1]">Total Entries</span>
          <p className="text-lg font-bold">{data.total_entries}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] px-3 py-2">
          <span className="text-slate-500 dark:text-[#cbd5e1]">Total Base Amount</span>
          <p className="text-lg font-bold">₹{fmt(data.total_base_amount)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] px-3 py-2">
          <span className="text-slate-500 dark:text-[#cbd5e1]">Total Tax</span>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">₹{fmt(data.total_tax_amount)}</p>
        </div>
      </div>
      <div className="mb-3 flex gap-4 text-xs text-slate-500 dark:text-[#cbd5e1]">
        <span>Pending: {data.pending_count}</span>
        <span>Deposited: {data.deposited_count}</span>
        <span>Filed: {data.filed_count}</span>
      </div>
      {data.party_lines.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-[#64748b]">No {tdsTcsType.toUpperCase()} entries found.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
              <th className="pb-1">Party</th>
              <th className="pb-1">Section</th>
              <th className="pb-1">Description</th>
              <th className="pb-1 text-right">Entries</th>
              <th className="pb-1 text-right">Base Amount (₹)</th>
              <th className="pb-1 text-right">Tax (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.party_lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                <td className="py-1 font-medium">{l.party_name}</td>
                <td className="py-1">{l.section_code}</td>
                <td className="py-1 text-slate-500 dark:text-[#cbd5e1]">{l.section_name}</td>
                <td className="py-1 text-right">{l.entry_count}</td>
                <td className="py-1 text-right">₹{fmt(l.total_base_amount)}</td>
                <td className="py-1 text-right font-medium">₹{fmt(l.total_tax_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-[#282832] font-medium">
              <td className="py-1" colSpan={3}>Total</td>
              <td className="py-1 text-right">{data.total_entries}</td>
              <td className="py-1 text-right">₹{fmt(data.total_base_amount)}</td>
              <td className="py-1 text-right">₹{fmt(data.total_tax_amount)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
