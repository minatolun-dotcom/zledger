import { toDisplayDate } from "../../utils/dateUtils";
import { BSData, ReportBaseProps, fmt, PreviewBtn, GroupTable } from "./shared";

export default function BalanceSheetReport({ data, onLedgerClick, onPreview, onDownload }: ReportBaseProps & { data: BSData }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">
          {data.financial_year_name} — {toDisplayDate(data.start_date)} to {toDisplayDate(data.end_date)}
        </p>
        <div className="flex gap-2">
          <PreviewBtn onClick={() => onPreview(`/reports/balance-sheet/pdf?financial_year_id=${data.financial_year_id}`, `Balance Sheet — ${data.financial_year_name}`)} />
          <button
            onClick={() => onDownload(`/reports/balance-sheet/pdf?financial_year_id=${data.financial_year_id}`, `balance-sheet-${data.financial_year_name}.pdf`)}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
          >
            Download PDF
          </button>
          <button
            onClick={() => onDownload(`/reports/balance-sheet/xlsx?financial_year_id=${data.financial_year_id}`, `balance-sheet-${data.financial_year_name}.xlsx`)}
            className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
          >
            Download Excel
          </button>
        </div>
      </div>
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
