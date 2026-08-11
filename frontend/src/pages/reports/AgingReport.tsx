import { toDisplayDate } from "../../utils/dateUtils";
import { AgingData, Tab, fmt, PreviewBtn } from "./shared";

interface AgingReportProps {
  data: AgingData;
  agingType: "receivable" | "payable";
  onAgingTypeChange: (t: "receivable" | "payable") => void;
  onFetchReport: (tab: Tab, fyId: string, subType: string) => void;
  selectedFy: string | null;
  onPreview: (url: string, title: string) => void;
  onDownload: (path: string, filename: string) => void;
}

export default function AgingReport({ data, agingType, onAgingTypeChange, onFetchReport, selectedFy, onPreview, onDownload }: AgingReportProps) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">
          {data.financial_year_name} — {toDisplayDate(data.start_date)} to {toDisplayDate(data.end_date)}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { onAgingTypeChange("receivable"); if (selectedFy) onFetchReport("aging", selectedFy, "receivable"); }}
            className={`rounded-lg border px-3 py-1 text-xs font-medium ${
              agingType === "receivable"
                ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            }`}
          >
            Receivables
          </button>
          <button
            onClick={() => { onAgingTypeChange("payable"); if (selectedFy) onFetchReport("aging", selectedFy, "payable"); }}
            className={`rounded-lg border px-3 py-1 text-xs font-medium ${
              agingType === "payable"
                ? "border-brand-600 dark:border-blue-500/50 bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            }`}
          >
            Payables
          </button>
          <PreviewBtn onClick={() => onPreview(`/reports/aging/pdf?financial_year_id=${data.financial_year_id}&type=${agingType}`, `Aging (${agingType}) — ${data.financial_year_name}`)} />
          <button onClick={() => onDownload(`/reports/aging/pdf?financial_year_id=${data.financial_year_id}&type=${agingType}`, `aging-${agingType}-${data.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">PDF</button>
          <button onClick={() => onDownload(`/reports/aging/xlsx?financial_year_id=${data.financial_year_id}&type=${agingType}`, `aging-${agingType}-${data.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Excel</button>
        </div>
      </div>
      {data.lines.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-[#64748b]">No outstanding {data.type}s.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
              <th className="pb-1">Party</th>
              <th className="pb-1 text-right">0-30 Days</th>
              <th className="pb-1 text-right">31-60 Days</th>
              <th className="pb-1 text-right">61-90 Days</th>
              <th className="pb-1 text-right">90+ Days</th>
              <th className="pb-1 text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                <td className="py-1 font-medium">{l.party_name}</td>
                {l.buckets.map((b) => (
                  <td key={b.label} className="py-1 text-right">
                    {b.amount > 0 ? `₹${fmt(b.amount)}` : ""}
                  </td>
                ))}
                <td className="py-1 text-right font-medium">₹{fmt(l.total_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-[#282832] font-medium">
              <td className="py-1">Total</td>
              {["0-30", "31-60", "61-90", "90+"].map((b) => {
                const total = data.lines.reduce((s, l) => {
                  const bucket = l.buckets.find((bb) => bb.label === b);
                  return s + (bucket?.amount ?? 0);
                }, 0);
                return <td key={b} className="py-1 text-right">₹{fmt(total)}</td>;
              })}
              <td className="py-1 text-right">₹{fmt(data.total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
