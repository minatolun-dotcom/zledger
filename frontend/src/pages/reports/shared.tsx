import { api } from "../../api/client";

export interface TrialBalanceLine {
  ledger_id: string; ledger_name: string; group_name: string; group_nature: string;
  opening_balance: number; opening_balance_type: string;
  total_debit: number; total_credit: number;
  closing_balance: number; closing_balance_type: string;
}

export interface ReportLedgerLine {
  ledger_id: string; ledger_name: string;
  opening_balance: number; opening_balance_type: string;
  total_debit: number; total_credit: number;
  closing_balance: number; closing_balance_type: string;
}

export interface ReportGroup {
  group_name: string; group_nature: string; ledgers: ReportLedgerLine[]; total: number;
}

export interface TrialBalanceData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  lines: TrialBalanceLine[]; total_debit: number; total_credit: number;
}

export interface PnLData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  income_groups: ReportGroup[]; expense_groups: ReportGroup[];
  total_income: number; total_expenses: number; net_profit: number; is_profit: boolean;
}

export interface BSData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  asset_groups: ReportGroup[]; liability_groups: ReportGroup[]; capital_groups: ReportGroup[];
  total_assets: number; total_liabilities: number; total_capital: number;
  total_liabilities_and_capital: number;
}

export interface CashFlowLine {
  label: string; inflow: number; outflow: number; net: number;
}

export interface CashFlowCategory {
  category: string; lines: CashFlowLine[];
  total_inflow: number; total_outflow: number; net: number;
}

export interface CashFlowData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  opening_balance: number; closing_balance: number; net_increase: number;
  operating: CashFlowCategory; investing: CashFlowCategory; financing: CashFlowCategory;
}

export interface AgingBucket { label: string; amount: number; count: number; }

export interface AgingPartyLine {
  party_name: string; total_amount: number; buckets: AgingBucket[];
}

export interface AgingData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  type: string; lines: AgingPartyLine[]; total: number;
}

export interface OutstandingPartyLine {
  party_name: string; party_type: string; balance: number; balance_type: string;
}

export interface OutstandingData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  debtors: OutstandingPartyLine[]; creditors: OutstandingPartyLine[];
  total_debtors: number; total_creditors: number;
}

export interface RegEntry {
  voucher_date: string; voucher_number: string; voucher_type: string;
  party_name: string | null; narration: string | null;
  debit: number; credit: number;
}

export interface RegisterData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  voucher_type: string; entries: RegEntry[];
  total_debit: number; total_credit: number;
}

export interface TdsTcsPartyLine {
  party_name: string; section_code: string; section_name: string;
  entry_count: number; total_base_amount: number; total_tax_amount: number;
}

export interface TdsTcsSummaryData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  tds_tcs_type: string; party_lines: TdsTcsPartyLine[];
  total_entries: number; total_base_amount: number; total_tax_amount: number;
  pending_count: number; deposited_count: number; filed_count: number;
}

export interface StockSummaryLine {
  stock_item_id: string; stock_item_name: string;
  quantity: number; avg_rate: number; total_value: number; valuation_method: string;
}

export interface StockSummaryData {
  lines: StockSummaryLine[]; total_quantity: number; total_value: number;
}

export interface StockMovementLine {
  stock_item_id: string; stock_item_name: string;
  opening_qty: number; opening_value: number;
  inward_qty: number; inward_value: number;
  outward_qty: number; outward_value: number;
  closing_qty: number; closing_value: number;
}

export interface StockMovementData {
  lines: StockMovementLine[];
}

export interface StockAgeingLine {
  stock_item_id: string; stock_item_name: string;
  quantity: number; avg_rate: number; total_value: number;
  last_entry_date: string | null; days_since_entry: number | null; ageing_bucket: string;
}

export interface StockAgeingData {
  lines: StockAgeingLine[]; total_quantity: number; total_value: number;
}

export interface LedgerTransactionLine {
  voucher_id: string; voucher_date: string; voucher_number: string;
  voucher_type: string; party_name: string | null; narration: string | null;
  debit: number; credit: number; running_balance: number;
}

export interface LedgerTransactionData {
  ledger_id: string; ledger_name: string;
  start_date: string; end_date: string;
  opening_balance: number; opening_balance_type: string;
  closing_balance: number; closing_balance_type: string;
  total_debit: number; total_credit: number;
  transactions: LedgerTransactionLine[];
}

export interface VoucherDetail {
  id: string; voucher_type: string; voucher_number: string; voucher_date: string;
  narration: string | null; party_name?: string; grand_total: number;
  lines: { ledger_id: string; ledger_name: string; debit: number; credit: number; }[];
}

export type Tab = "trial-balance" | "profit-and-loss" | "balance-sheet" | "cash-flow" | "aging" | "outstanding" | "register" | "tds-tcs" | "stock-summary" | "stock-movement" | "stock-ageing";

export interface ReportBaseProps {
  onLedgerClick: (ledgerId: string) => void;
  onPreview: (url: string, title: string) => void;
  onDownload: (path: string, filename: string) => void;
}

export const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function downloadFile(path: string, filename: string) {
  const blob = await api.download(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PreviewBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Preview PDF"
      className="rounded-lg border border-slate-300 px-2 py-1 text-slate-500 hover:bg-slate-50 hover:text-brand-600 dark:border-[#282832] dark:text-[#64748b] dark:hover:bg-[#1a1a24] dark:hover:text-brand-400"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>
  );
}

export function GroupTable({ groups, onLedgerClick }: { groups: ReportGroup[]; onLedgerClick: (lid: string) => void }) {
  if (groups.length === 0) return <p className="py-2 text-sm text-slate-400 dark:text-[#64748b]">No data.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
          <th className="pb-1">Ledger</th>
          <th className="pb-1 text-right">Opening</th>
          <th className="pb-1 text-right">Debit</th>
          <th className="pb-1 text-right">Credit</th>
          <th className="pb-1 text-right">Closing</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <GroupRows key={g.group_name} group={g} onLedgerClick={onLedgerClick} />
        ))}
      </tbody>
    </table>
  );
}

export function GroupRows({ group, onLedgerClick }: { group: ReportGroup; onLedgerClick: (lid: string) => void }) {
  return (
    <>
      <tr className="border-t border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#16161f]/80">
        <td colSpan={4} className="py-1 font-semibold text-slate-800 dark:text-[#f1f5f9]">{group.group_name}</td>
        <td className="py-1 text-right font-medium">₹{fmt(group.total)}</td>
      </tr>
      {group.ledgers.map((l) => (
        <tr key={l.ledger_id} className="border-t border-slate-100 dark:border-[#1a1a24]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#282832]/50" onClick={() => onLedgerClick(l.ledger_id)}>
          <td className="py-1 pl-4 text-brand-600 dark:text-blue-400 hover:underline">{l.ledger_name}</td>
          <td className="py-1 text-right">₹{fmt(l.opening_balance)} {l.opening_balance_type}</td>
          <td className="py-1 text-right">₹{fmt(l.total_debit)}</td>
          <td className="py-1 text-right">₹{fmt(l.total_credit)}</td>
          <td className="py-1 text-right">₹{fmt(l.closing_balance)} {l.closing_balance_type}</td>
        </tr>
      ))}
    </>
  );
}
