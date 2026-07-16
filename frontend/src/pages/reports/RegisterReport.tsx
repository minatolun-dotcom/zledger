import { toDisplayDate } from "../../utils/dateUtils";
import { RegisterData, Tab, fmt, PreviewBtn } from "./shared";
import Select from "../../components/Select";

interface RegisterReportProps {
  data: RegisterData;
  regVoucherType: string;
  onRegVoucherTypeChange: (vt: string) => void;
  onFetchReport: (tab: Tab, fyId: string, subType: string | undefined, subVt: string) => void;
  selectedFy: string | null;
  onPreview: (url: string, title: string) => void;
  onDownload: (path: string, filename: string) => void;
}

export default function RegisterReport({ data, regVoucherType, onRegVoucherTypeChange, onFetchReport, selectedFy, onPreview, onDownload }: RegisterReportProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">
          {data.financial_year_name} — {toDisplayDate(data.start_date)} to {toDisplayDate(data.end_date)}
        </p>
        <Select
          value={regVoucherType}
          onChange={(vt) => { onRegVoucherTypeChange(vt); if (selectedFy) onFetchReport("register", selectedFy, undefined, vt); }}
          options={[
            { value: "sales", label: "Sales Register" },
            { value: "purchase", label: "Purchase Register" },
            { value: "receipt", label: "Receipt Register" },
            { value: "payment", label: "Payment Register" },
            { value: "journal", label: "Journal Register" },
            { value: "contra", label: "Contra Register" },
            { value: "credit_note", label: "Credit Note Register" },
            { value: "debit_note", label: "Debit Note Register" },
          ]}
        />
        <div className="flex gap-2">
          <PreviewBtn onClick={() => onPreview(`/reports/register/pdf?financial_year_id=${data.financial_year_id}&voucher_type=${regVoucherType}`, `${regVoucherType} Register — ${data.financial_year_name}`)} />
          <button onClick={() => onDownload(`/reports/register/pdf?financial_year_id=${data.financial_year_id}&voucher_type=${regVoucherType}`, `register-${regVoucherType}-${data.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">PDF</button>
          <button onClick={() => onDownload(`/reports/register/xlsx?financial_year_id=${data.financial_year_id}&voucher_type=${regVoucherType}`, `register-${regVoucherType}-${data.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Excel</button>
        </div>
      </div>
      {data.entries.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-[#64748b]">No entries found.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
              <th className="pb-1">Date</th>
              <th className="pb-1">Voucher No</th>
              <th className="pb-1">Party</th>
              <th className="pb-1">Narration</th>
              <th className="pb-1 text-right">Debit (₹)</th>
              <th className="pb-1 text-right">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                <td className="py-1">{toDisplayDate(e.voucher_date)}</td>
                <td className="py-1">{e.voucher_number}</td>
                <td className="py-1">{e.party_name || ""}</td>
                <td className="py-1 max-w-xs truncate text-slate-500 dark:text-[#cbd5e1]">{e.narration || ""}</td>
                <td className="py-1 text-right">{e.debit > 0 ? `₹${fmt(e.debit)}` : ""}</td>
                <td className="py-1 text-right">{e.credit > 0 ? `₹${fmt(e.credit)}` : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-[#282832] font-medium">
              <td className="py-1" colSpan={4}>Total</td>
              <td className="py-1 text-right">₹{fmt(data.total_debit)}</td>
              <td className="py-1 text-right">₹{fmt(data.total_credit)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
