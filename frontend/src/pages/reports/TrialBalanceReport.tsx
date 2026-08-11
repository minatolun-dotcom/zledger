import { TrialBalanceData, ReportBaseProps, fmt, ReportHeader, ReportActions } from "./shared";

export default function TrialBalanceReport({ data, onLedgerClick, onPreview, onDownload }: ReportBaseProps & { data: TrialBalanceData }) {
  return (
    <div>
      <ReportHeader data={data} />
      <ReportActions report="trial-balance" financialYearId={data.financial_year_id} title={`Trial Balance — ${data.financial_year_name}`} onPreview={onPreview} onDownload={onDownload} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
            <th className="pb-1">Ledger</th>
            <th className="pb-1">Group</th>
            <th className="pb-1 text-right">Debit (₹)</th>
            <th className="pb-1 text-right">Credit (₹)</th>
            <th className="pb-1 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.ledger_id} className="border-t border-slate-100 dark:border-[#1a1a24]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#282832]/50" onClick={() => onLedgerClick(l.ledger_id)}>
              <td className="py-1 text-brand-600 dark:text-blue-400 hover:underline">{l.ledger_name}</td>
              <td className="py-1 text-slate-500 dark:text-[#cbd5e1]">{l.group_name}</td>
              <td className="py-1 text-right">{l.total_debit > 0 ? `₹${fmt(l.total_debit)}` : ""}</td>
              <td className="py-1 text-right">{l.total_credit > 0 ? `₹${fmt(l.total_credit)}` : ""}</td>
              <td className="py-1 text-right">₹{fmt(l.closing_balance)} {l.closing_balance_type}</td>
            </tr>
          ))}
          {data.lines.length === 0 && (
            <tr><td colSpan={5} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No data.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 dark:border-[#282832] font-medium">
            <td className="py-1" colSpan={2}>Total</td>
            <td className="py-1 text-right">₹{fmt(data.total_debit)}</td>
            <td className="py-1 text-right">₹{fmt(data.total_credit)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}