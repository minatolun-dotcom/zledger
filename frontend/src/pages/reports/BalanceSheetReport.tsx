import { BSData, ReportBaseProps, fmt, ReportHeader, ReportActions, GroupTable } from "./shared";

export default function BalanceSheetReport({ data, onLedgerClick, onPreview, onDownload }: ReportBaseProps & { data: BSData }) {
  return (
    <div>
      <ReportHeader data={data} />
      <ReportActions report="balance-sheet" financialYearId={data.financial_year_id} title={`Balance Sheet — ${data.financial_year_name}`} onPreview={onPreview} onDownload={onDownload} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Assets</h3>
          <GroupTable groups={data.asset_groups} onLedgerClick={onLedgerClick} />
          <p className="mt-2 text-right text-sm font-medium">
            Total Assets: ₹{fmt(data.total_assets)}
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Liabilities & Capital</h3>
          <GroupTable groups={data.liability_groups} onLedgerClick={onLedgerClick} />
          <GroupTable groups={data.capital_groups} onLedgerClick={onLedgerClick} />
          <p className="mt-2 text-right text-sm font-medium">
            Total: ₹{fmt(data.total_liabilities_and_capital)}
          </p>
          {Math.abs(data.round_off_total ?? 0) >= 0.005 && (
            <p className="mt-1 text-right text-xs text-slate-500 dark:text-[#94a3b8]">
              Of which, Round Off adjustment: ₹{fmt(Math.abs(data.round_off_total!))} {data.round_off_type === "Dr" ? "Dr" : "Cr"}
            </p>
          )}
        </div>
      </div>
      <div className={`mt-4 border-t pt-3 text-right text-lg font-bold ${
        Math.abs(data.total_assets - data.total_liabilities_and_capital) < 0.01
          ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
      }`}>
        {Math.abs(data.total_assets - data.total_liabilities_and_capital) < 0.01
          ? "Balance Sheet is balanced ✓"
          : `Difference: ₹${fmt(Math.abs(data.total_assets - data.total_liabilities_and_capital))}`
        }
      </div>
    </div>
  );
}