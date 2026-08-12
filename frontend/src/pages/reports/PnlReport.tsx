import { PnLData, ReportBaseProps, fmt, ReportHeader, ReportActions, GroupTable } from "./shared";

export default function PnlReport({ data, onLedgerClick, onPreview, onDownload }: ReportBaseProps & { data: PnLData }) {
  return (
    <div>
      <ReportHeader data={data} />
      <ReportActions report="profit-and-loss" financialYearId={data.financial_year_id} title={`Profit & Loss — ${data.financial_year_name}`} onPreview={onPreview} onDownload={onDownload} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Income</h3>
          <GroupTable groups={data.income_groups} onLedgerClick={onLedgerClick} />
          <p className="mt-2 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Total Income: ₹{fmt(data.total_income)}
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Expenses</h3>
          <GroupTable groups={data.expense_groups} onLedgerClick={onLedgerClick} />
          <p className="mt-2 text-right text-sm font-medium text-red-700 dark:text-red-400">
            Total Expenses: ₹{fmt(data.total_expenses)}
          </p>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-200 dark:border-[#1a1a24] pt-3 text-right">
        <span className={`text-lg font-bold ${data.is_profit ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          {data.is_profit ? "Net Profit" : "Net Loss"}: ₹{fmt(Math.abs(data.net_profit))}
        </span>
        {data.round_off_total != null && Math.abs(data.round_off_total) >= 0.005 && (
          <p className="mt-1 text-xs text-slate-500 dark:text-[#94a3b8]">
            Of which, Round Off adjustment: ₹{fmt(Math.abs(data.round_off_total))} {data.round_off_type}
          </p>
        )}
      </div>
    </div>
  );
}