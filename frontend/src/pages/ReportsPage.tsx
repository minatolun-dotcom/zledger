import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api/client";
import { toDisplayDate } from "../utils/dateUtils";
import { useFyStore } from "../store/fy";
import Select from "../components/Select";
import PdfPreviewModal from "../components/PdfPreviewModal";
import { ReportsSkeleton } from "./skeletons";

interface FinancialYear { id: string; name: string; start_date: string; end_date: string; }

interface TrialBalanceLine {
  ledger_id: string; ledger_name: string; group_name: string; group_nature: string;
  opening_balance: number; opening_balance_type: string;
  total_debit: number; total_credit: number;
  closing_balance: number; closing_balance_type: string;
}

interface ReportLedgerLine {
  ledger_id: string; ledger_name: string;
  opening_balance: number; opening_balance_type: string;
  total_debit: number; total_credit: number;
  closing_balance: number; closing_balance_type: string;
}

interface ReportGroup {
  group_name: string; group_nature: string; ledgers: ReportLedgerLine[]; total: number;
}

interface TrialBalanceData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  lines: TrialBalanceLine[]; total_debit: number; total_credit: number;
}

interface PnLData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  income_groups: ReportGroup[]; expense_groups: ReportGroup[];
  total_income: number; total_expenses: number; net_profit: number; is_profit: boolean;
}

interface BSData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  asset_groups: ReportGroup[]; liability_groups: ReportGroup[]; capital_groups: ReportGroup[];
  total_assets: number; total_liabilities: number; total_capital: number;
  total_liabilities_and_capital: number;
}

interface CashFlowLine {
  label: string; inflow: number; outflow: number; net: number;
}

interface CashFlowCategory {
  category: string; lines: CashFlowLine[];
  total_inflow: number; total_outflow: number; net: number;
}

interface CashFlowData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  opening_balance: number; closing_balance: number; net_increase: number;
  operating: CashFlowCategory; investing: CashFlowCategory; financing: CashFlowCategory;
}

interface AgingBucket { label: string; amount: number; count: number; }

interface AgingPartyLine {
  party_name: string; total_amount: number; buckets: AgingBucket[];
}

interface AgingData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  type: string; lines: AgingPartyLine[]; total: number;
}

interface OutstandingPartyLine {
  party_name: string; party_type: string; balance: number; balance_type: string;
}

interface OutstandingData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  debtors: OutstandingPartyLine[]; creditors: OutstandingPartyLine[];
  total_debtors: number; total_creditors: number;
}

interface RegEntry {
  voucher_date: string; voucher_number: string; voucher_type: string;
  party_name: string | null; narration: string | null;
  debit: number; credit: number;
}

interface RegisterData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  voucher_type: string; entries: RegEntry[];
  total_debit: number; total_credit: number;
}

interface TdsTcsPartyLine {
  party_name: string; section_code: string; section_name: string;
  entry_count: number; total_base_amount: number; total_tax_amount: number;
}

interface TdsTcsSummaryData {
  financial_year_id: string; financial_year_name: string;
  start_date: string; end_date: string;
  tds_tcs_type: string; party_lines: TdsTcsPartyLine[];
  total_entries: number; total_base_amount: number; total_tax_amount: number;
  pending_count: number; deposited_count: number; filed_count: number;
}

interface StockSummaryLine {
  stock_item_id: string; stock_item_name: string;
  quantity: number; avg_rate: number; total_value: number; valuation_method: string;
}

interface StockSummaryData {
  lines: StockSummaryLine[]; total_quantity: number; total_value: number;
}

interface StockMovementLine {
  stock_item_id: string; stock_item_name: string;
  opening_qty: number; opening_value: number;
  inward_qty: number; inward_value: number;
  outward_qty: number; outward_value: number;
  closing_qty: number; closing_value: number;
}

interface StockMovementData {
  lines: StockMovementLine[];
}

interface StockAgeingLine {
  stock_item_id: string; stock_item_name: string;
  quantity: number; avg_rate: number; total_value: number;
  last_entry_date: string | null; days_since_entry: number | null; ageing_bucket: string;
}

interface StockAgeingData {
  lines: StockAgeingLine[]; total_quantity: number; total_value: number;
}

interface LedgerTransactionLine {
  voucher_id: string; voucher_date: string; voucher_number: string;
  voucher_type: string; party_name: string | null; narration: string | null;
  debit: number; credit: number; running_balance: number;
}

interface LedgerTransactionData {
  ledger_id: string; ledger_name: string;
  start_date: string; end_date: string;
  opening_balance: number; opening_balance_type: string;
  closing_balance: number; closing_balance_type: string;
  total_debit: number; total_credit: number;
  transactions: LedgerTransactionLine[];
}

interface VoucherDetail {
  id: string; voucher_type: string; voucher_number: string; voucher_date: string;
  narration: string | null; party_name?: string; grand_total: number;
  lines: { ledger_id: string; ledger_name: string; debit: number; credit: number; }[];
}

type Tab = "trial-balance" | "profit-and-loss" | "balance-sheet" | "cash-flow" | "aging" | "outstanding" | "register" | "tds-tcs" | "stock-summary" | "stock-movement" | "stock-ageing";

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function downloadFile(path: string, filename: string) {
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

function PreviewBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Preview PDF"
      className="rounded-lg border border-slate-300 px-2 py-1 text-slate-500 hover:bg-slate-50 hover:text-brand-600 dark:border-[#252530] dark:text-[#64748b] dark:hover:bg-[#1e1e28] dark:hover:text-brand-400"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>
  );
}

function GroupTable({ groups, onLedgerClick }: { groups: ReportGroup[]; onLedgerClick: (lid: string) => void }) {
  if (groups.length === 0) return <p className="py-2 text-sm text-slate-400 dark:text-[#64748b]">No data.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
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

function GroupRows({ group, onLedgerClick }: { group: ReportGroup; onLedgerClick: (lid: string) => void }) {
  return (
    <>
      <tr className="border-t border-slate-200 dark:border-[#1e1e28] bg-slate-50 dark:bg-[#18181f]/80">
        <td colSpan={4} className="py-1 font-semibold text-slate-800 dark:text-[#f1f5f9]">{group.group_name}</td>
        <td className="py-1 text-right font-medium">₹{fmt(group.total)}</td>
      </tr>
      {group.ledgers.map((l) => (
        <tr key={l.ledger_id} className="border-t border-slate-100 dark:border-[#1e1e28]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252530]/50" onClick={() => onLedgerClick(l.ledger_id)}>
          <td className="py-1 pl-4 text-brand-600 dark:text-violet-400 hover:underline">{l.ledger_name}</td>
          <td className="py-1 text-right">₹{fmt(l.opening_balance)} {l.opening_balance_type}</td>
          <td className="py-1 text-right">₹{fmt(l.total_debit)}</td>
          <td className="py-1 text-right">₹{fmt(l.total_credit)}</td>
          <td className="py-1 text-right">₹{fmt(l.closing_balance)} {l.closing_balance_type}</td>
        </tr>
      ))}
    </>
  );
}

export default function ReportsPage() {
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const { activeFyId: selectedFy, setActiveFy: setSelectedFy } = useFyStore();
  const [tab, setTab] = useState<Tab>("trial-balance");
  const [loading, setLoading] = useState(false);
  const [tbData, setTbData] = useState<TrialBalanceData | null>(null);
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [bsData, setBsData] = useState<BSData | null>(null);
  const [cfData, setCfData] = useState<CashFlowData | null>(null);
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  const [osData, setOsData] = useState<OutstandingData | null>(null);
  const [regData, setRegData] = useState<RegisterData | null>(null);
  const [tdsData, setTdsData] = useState<TdsTcsSummaryData | null>(null);
  const [stockSummaryData, setStockSummaryData] = useState<StockSummaryData | null>(null);
  const [stockMovementData, setStockMovementData] = useState<StockMovementData | null>(null);
  const [stockAgeingData, setStockAgeingData] = useState<StockAgeingData | null>(null);
  const [agingType, setAgingType] = useState<"receivable" | "payable">("receivable");
  const [regVoucherType, setRegVoucherType] = useState("sales");
  const [tdsTcsType, setTdsTcsType] = useState("tds");
  const [error, setError] = useState("");
  const [ledgerTx, setLedgerTx] = useState<LedgerTransactionData | null>(null);
  const [showLedgerDetail, setShowLedgerDetail] = useState(false);
  const [ledgerDetailLoading, setLedgerDetailLoading] = useState(false);
  const [voucherDetail, setVoucherDetail] = useState<VoucherDetail | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    api.get<FinancialYear[]>("/coa/financial-years").then((fys) => {
      setFys(fys);
      if (fys.length > 0 && (!selectedFy || !fys.some((f) => f.id === selectedFy))) {
        setSelectedFy(fys[fys.length - 1].id);
      }
    });
  }, []);

  const fetchReport = useCallback((tabName: Tab, fyId: string, subType?: string, subVt?: string) => {
    if (!fyId) return;
    setLoading(true);
    setError("");
    setTbData(null);
    setPnlData(null);
    setBsData(null);
    setCfData(null);
    setAgingData(null);
    setOsData(null);
    setRegData(null);
    setTdsData(null);
    setStockSummaryData(null);
    setStockMovementData(null);
    setStockAgeingData(null);

    let endpoint = `/reports/${tabName}?financial_year_id=${fyId}`;
    if (tabName === "aging") endpoint += `&type=${subType || agingType}`;
    if (tabName === "register") endpoint += `&voucher_type=${subVt || regVoucherType}`;
    if (tabName === "tds-tcs") endpoint = `/reports/tds-tcs-summary?financial_year_id=${fyId}&tds_tcs_type=${subType || tdsTcsType}`;
    if (tabName === "stock-summary" || tabName === "stock-movement" || tabName === "stock-ageing") {
      endpoint = `/reports/${tabName}`;
    }

    api.get<any>(endpoint)
      .then((data) => {
        if (tabName === "trial-balance") setTbData(data as TrialBalanceData);
        else if (tabName === "profit-and-loss") setPnlData(data as PnLData);
        else if (tabName === "balance-sheet") setBsData(data as BSData);
        else if (tabName === "cash-flow") setCfData(data as CashFlowData);
        else if (tabName === "aging") setAgingData(data as AgingData);
        else if (tabName === "outstanding") setOsData(data as OutstandingData);
        else if (tabName === "register") setRegData(data as RegisterData);
        else if (tabName === "tds-tcs") setTdsData(data as TdsTcsSummaryData);
        else if (tabName === "stock-summary") setStockSummaryData(data as StockSummaryData);
        else if (tabName === "stock-movement") setStockMovementData(data as StockMovementData);
        else if (tabName === "stock-ageing") setStockAgeingData(data as StockAgeingData);
      })
      .catch((err: any) => setError(err?.message || "Failed to load report"))
      .finally(() => setLoading(false));
  }, [agingType, regVoucherType, tdsTcsType]);

  const fetchLedgerTransactions = async (ledgerId: string) => {
    if (!selectedFy) return;
    setLedgerDetailLoading(true);
    setVoucherDetail(null);
    try {
      const data = await api.get<LedgerTransactionData>(`/reports/ledger-transactions?ledger_id=${ledgerId}&financial_year_id=${selectedFy}`);
      setLedgerTx(data);
      setShowLedgerDetail(true);
    } catch (err: any) {
      setError(err?.message || "Failed to load ledger transactions");
    } finally {
      setLedgerDetailLoading(false);
    }
  };

  const closeLedgerDetail = () => {
    setShowLedgerDetail(false);
    setLedgerTx(null);
    setVoucherDetail(null);
  };

  const fetchVoucherDetail = async (voucherId: string) => {
    try {
      const data = await api.get<any>(`/vouchers/${voucherId}`);
      // Map lines to ledgers
      const lines = (data.lines || []).map((l: any) => ({
        ledger_id: l.ledger_id,
        ledger_name: l.ledger_name || l.ledger_id,
        debit: l.debit || 0,
        credit: l.credit || 0,
      }));
      setVoucherDetail({ ...data, lines });
    } catch { /* ignore */ }
  };

  const handleTab = (t: Tab) => {
    setTab(t);
    if (selectedFy) fetchReport(t, selectedFy);
  };

  useEffect(() => {
    if (selectedFy) fetchReport(tabRef.current, selectedFy);
  }, [selectedFy, fetchReport]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "trial-balance", label: "Trial Balance" },
    { key: "profit-and-loss", label: "Profit & Loss" },
    { key: "balance-sheet", label: "Balance Sheet" },
    { key: "cash-flow", label: "Cash Flow" },
    { key: "aging", label: "Aging" },
    { key: "outstanding", label: "Outstanding" },
    { key: "register", label: "Register" },
    { key: "tds-tcs", label: "TDS/TCS" },
    { key: "stock-summary", label: "Stock Summary" },
    { key: "stock-movement", label: "Stock Movement" },
    { key: "stock-ageing", label: "Stock Ageing" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Reports</h2>
        <Select
          value={selectedFy ?? ""}
          onChange={(id) => { if (id) setSelectedFy(id); }}
          options={fys.map((fy) => ({ value: fy.id, label: `${fy.name} (${toDisplayDate(fy.start_date)} to ${toDisplayDate(fy.end_date)})` }))}
          placeholder="Select Financial Year"
          className="w-64"
        />
      </div>

      <div className="mt-4 flex gap-1 border-b border-slate-200 dark:border-[#1e1e28]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? "border-brand-600 text-brand-700 dark:text-violet-400"
                : "border-transparent text-slate-500 dark:text-[#94a3b8] hover:text-slate-700 dark:hover:text-[#f1f5f9]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {loading ? (
        <ReportsSkeleton />
      ) : (
        <div className="mt-4">
          {/* Trial Balance */}
          {tbData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  {tbData.financial_year_name} — {toDisplayDate(tbData.start_date)} to {toDisplayDate(tbData.end_date)}
                </p>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl(`/reports/trial-balance/pdf?financial_year_id=${tbData.financial_year_id}`); setPreviewTitle(`Trial Balance — ${tbData.financial_year_name}`); }} />
                  <button
                    onClick={() => downloadFile(`/reports/trial-balance/pdf?financial_year_id=${tbData.financial_year_id}`, `trial-balance-${tbData.financial_year_name}.pdf`)}
                    className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => downloadFile(`/reports/trial-balance/xlsx?financial_year_id=${tbData.financial_year_id}`, `trial-balance-${tbData.financial_year_name}.xlsx`)}
                    className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                    <th className="pb-1">Ledger</th>
                    <th className="pb-1">Group</th>
                    <th className="pb-1 text-right">Debit (₹)</th>
                    <th className="pb-1 text-right">Credit (₹)</th>
                    <th className="pb-1 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {tbData.lines.map((l) => (
                    <tr key={l.ledger_id} className="border-t border-slate-100 dark:border-[#1e1e28]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252530]/50" onClick={() => fetchLedgerTransactions(l.ledger_id)}>
                      <td className="py-1 text-brand-600 dark:text-violet-400 hover:underline">{l.ledger_name}</td>
                      <td className="py-1 text-slate-500 dark:text-[#94a3b8]">{l.group_name}</td>
                      <td className="py-1 text-right">{l.total_debit > 0 ? `₹${fmt(l.total_debit)}` : ""}</td>
                      <td className="py-1 text-right">{l.total_credit > 0 ? `₹${fmt(l.total_credit)}` : ""}</td>
                      <td className="py-1 text-right">₹{fmt(l.closing_balance)} {l.closing_balance_type}</td>
                    </tr>
                  ))}
                  {tbData.lines.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No data.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-[#252530] font-medium">
                    <td className="py-1" colSpan={2}>Total</td>
                    <td className="py-1 text-right">₹{fmt(tbData.total_debit)}</td>
                    <td className="py-1 text-right">₹{fmt(tbData.total_credit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Profit & Loss */}
          {pnlData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  {pnlData.financial_year_name} — {toDisplayDate(pnlData.start_date)} to {toDisplayDate(pnlData.end_date)}
                </p>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl(`/reports/profit-and-loss/pdf?financial_year_id=${pnlData.financial_year_id}`); setPreviewTitle(`Profit & Loss — ${pnlData.financial_year_name}`); }} />
                  <button
                    onClick={() => downloadFile(`/reports/profit-and-loss/pdf?financial_year_id=${pnlData.financial_year_id}`, `profit-and-loss-${pnlData.financial_year_name}.pdf`)}
                    className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => downloadFile(`/reports/profit-and-loss/xlsx?financial_year_id=${pnlData.financial_year_id}`, `profit-and-loss-${pnlData.financial_year_name}.xlsx`)}
                    className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Income</h3>
                  <GroupTable groups={pnlData.income_groups} onLedgerClick={fetchLedgerTransactions} />
                  <p className="mt-2 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Total Income: ₹{fmt(pnlData.total_income)}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Expenses</h3>
                  <GroupTable groups={pnlData.expense_groups} onLedgerClick={fetchLedgerTransactions} />
                  <p className="mt-2 text-right text-sm font-medium text-red-700 dark:text-red-400">
                    Total Expenses: ₹{fmt(pnlData.total_expenses)}
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-200 dark:border-[#1e1e28] pt-3 text-right">
                <span className={`text-lg font-bold ${pnlData.is_profit ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {pnlData.is_profit ? "Net Profit" : "Net Loss"}: ₹{fmt(Math.abs(pnlData.net_profit))}
                </span>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {bsData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  {bsData.financial_year_name} — {toDisplayDate(bsData.start_date)} to {toDisplayDate(bsData.end_date)}
                </p>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl(`/reports/balance-sheet/pdf?financial_year_id=${bsData.financial_year_id}`); setPreviewTitle(`Balance Sheet — ${bsData.financial_year_name}`); }} />
                  <button
                    onClick={() => downloadFile(`/reports/balance-sheet/pdf?financial_year_id=${bsData.financial_year_id}`, `balance-sheet-${bsData.financial_year_name}.pdf`)}
                    className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => downloadFile(`/reports/balance-sheet/xlsx?financial_year_id=${bsData.financial_year_id}`, `balance-sheet-${bsData.financial_year_name}.xlsx`)}
                    className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Assets</h3>
                  <GroupTable groups={bsData.asset_groups} onLedgerClick={fetchLedgerTransactions} />
                  <p className="mt-2 text-right text-sm font-medium">
                    Total Assets: ₹{fmt(bsData.total_assets)}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Liabilities & Capital</h3>
                  <GroupTable groups={bsData.liability_groups} onLedgerClick={fetchLedgerTransactions} />
                  <GroupTable groups={bsData.capital_groups} onLedgerClick={fetchLedgerTransactions} />
                  <p className="mt-2 text-right text-sm font-medium">
                    Total: ₹{fmt(bsData.total_liabilities_and_capital)}
                  </p>
                </div>
              </div>
              <div className={`mt-4 border-t pt-3 text-right text-lg font-bold ${
                Math.abs(bsData.total_assets - bsData.total_liabilities_and_capital) < 0.01
                  ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
              }`}>
                {Math.abs(bsData.total_assets - bsData.total_liabilities_and_capital) < 0.01
                  ? "Balance Sheet is balanced ✓"
                  : `Difference: ₹${fmt(Math.abs(bsData.total_assets - bsData.total_liabilities_and_capital))}`
                }
              </div>
            </div>
          )}

          {/* Cash Flow */}
          {cfData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  {cfData.financial_year_name} — {toDisplayDate(cfData.start_date)} to {toDisplayDate(cfData.end_date)}
                </p>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl(`/reports/cash-flow/pdf?financial_year_id=${cfData.financial_year_id}`); setPreviewTitle(`Cash Flow — ${cfData.financial_year_name}`); }} />
                  <button onClick={() => downloadFile(`/reports/cash-flow/pdf?financial_year_id=${cfData.financial_year_id}`, `cash-flow-${cfData.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download PDF</button>
                  <button onClick={() => downloadFile(`/reports/cash-flow/xlsx?financial_year_id=${cfData.financial_year_id}`, `cash-flow-${cfData.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download Excel</button>
                </div>
              </div>
              <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] px-3 py-2">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Opening Balance</span>
                  <p className="text-lg font-bold">₹{fmt(cfData.opening_balance)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] px-3 py-2">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Net Increase</span>
                  <p className={`text-lg font-bold ${cfData.net_increase >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    ₹{fmt(Math.abs(cfData.net_increase))}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] px-3 py-2">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Closing Balance</span>
                  <p className="text-lg font-bold">₹{fmt(cfData.closing_balance)}</p>
                </div>
              </div>
              {[cfData.operating, cfData.investing, cfData.financing].map((cat) => (
                <div key={cat.category} className="mb-4">
                  <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">{cat.category}</h3>
                  {cat.lines.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-[#64748b]">No transactions.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                          <th className="pb-1">Account</th>
                          <th className="pb-1 text-right">Inflow (₹)</th>
                          <th className="pb-1 text-right">Outflow (₹)</th>
                          <th className="pb-1 text-right">Net (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.lines.map((l) => (
                          <tr key={l.label} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                            <td className="py-1">{l.label}</td>
                            <td className="py-1 text-right">{l.inflow > 0 ? `₹${fmt(l.inflow)}` : ""}</td>
                            <td className="py-1 text-right">{l.outflow > 0 ? `₹${fmt(l.outflow)}` : ""}</td>
                            <td className="py-1 text-right font-medium">₹{fmt(l.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 dark:border-[#252530] font-medium">
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
          )}

          {/* Aging */}
          {agingData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  {agingData.financial_year_name} — {toDisplayDate(agingData.start_date)} to {toDisplayDate(agingData.end_date)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAgingType("receivable"); if (selectedFy) fetchReport("aging", selectedFy, "receivable"); }}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                      agingType === "receivable"
                        ? "border-brand-600 dark:border-violet-500/50 bg-brand-50 dark:bg-violet-500/10 text-brand-700 dark:text-violet-400"
                        : "border-slate-300 dark:border-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                    }`}
                  >
                    Receivables
                  </button>
                  <button
                    onClick={() => { setAgingType("payable"); if (selectedFy) fetchReport("aging", selectedFy, "payable"); }}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                      agingType === "payable"
                        ? "border-brand-600 dark:border-violet-500/50 bg-brand-50 dark:bg-violet-500/10 text-brand-700 dark:text-violet-400"
                        : "border-slate-300 dark:border-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                    }`}
                  >
                    Payables
                  </button>
                  <PreviewBtn onClick={() => { setPreviewUrl(`/reports/aging/pdf?financial_year_id=${agingData.financial_year_id}&type=${agingType}`); setPreviewTitle(`Aging (${agingType}) — ${agingData.financial_year_name}`); }} />
                  <button onClick={() => downloadFile(`/reports/aging/pdf?financial_year_id=${agingData.financial_year_id}&type=${agingType}`, `aging-${agingType}-${agingData.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">PDF</button>
                  <button onClick={() => downloadFile(`/reports/aging/xlsx?financial_year_id=${agingData.financial_year_id}&type=${agingType}`, `aging-${agingType}-${agingData.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Excel</button>
                </div>
              </div>
              {agingData.lines.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No outstanding {agingData.type}s.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">Party</th>
                      <th className="pb-1 text-right">0-30 Days</th>
                      <th className="pb-1 text-right">31-60 Days</th>
                      <th className="pb-1 text-right">61-90 Days</th>
                      <th className="pb-1 text-right">90+ Days</th>
                      <th className="pb-1 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingData.lines.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
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
                    <tr className="border-t-2 border-slate-300 dark:border-[#252530] font-medium">
                      <td className="py-1">Total</td>
                      {["0-30", "31-60", "61-90", "90+"].map((b) => {
                        const total = agingData.lines.reduce((s, l) => {
                          const bucket = l.buckets.find((bb) => bb.label === b);
                          return s + (bucket?.amount ?? 0);
                        }, 0);
                        return <td key={b} className="py-1 text-right">₹{fmt(total)}</td>;
                      })}
                      <td className="py-1 text-right">₹{fmt(agingData.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* Outstanding */}
          {osData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  {osData.financial_year_name} — {toDisplayDate(osData.start_date)} to {toDisplayDate(osData.end_date)}
                </p>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl(`/reports/outstanding/pdf?financial_year_id=${osData.financial_year_id}`); setPreviewTitle(`Outstanding — ${osData.financial_year_name}`); }} />
                  <button onClick={() => downloadFile(`/reports/outstanding/pdf?financial_year_id=${osData.financial_year_id}`, `outstanding-${osData.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download PDF</button>
                  <button onClick={() => downloadFile(`/reports/outstanding/xlsx?financial_year_id=${osData.financial_year_id}`, `outstanding-${osData.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download Excel</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
                    Debtors ({osData.debtors.length}) — Total: ₹{fmt(osData.total_debtors)}
                  </h3>
                  {osData.debtors.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-[#64748b]">No debtors.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                          <th className="pb-1">Party</th>
                          <th className="pb-1 text-right">Balance (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {osData.debtors.map((d, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
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
                    Creditors ({osData.creditors.length}) — Total: ₹{fmt(osData.total_creditors)}
                  </h3>
                  {osData.creditors.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-[#64748b]">No creditors.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                          <th className="pb-1">Party</th>
                          <th className="pb-1 text-right">Balance (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {osData.creditors.map((c, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
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
          )}

          {/* Register */}
          {regData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  {regData.financial_year_name} — {toDisplayDate(regData.start_date)} to {toDisplayDate(regData.end_date)}
                </p>
                <select
                  value={regVoucherType}
                  onChange={(e) => { const vt = e.target.value; setRegVoucherType(vt); if (selectedFy) fetchReport("register", selectedFy, undefined, vt); }}
                  className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                >
                  <option value="sales">Sales Register</option>
                  <option value="purchase">Purchase Register</option>
                  <option value="receipt">Receipt Register</option>
                  <option value="payment">Payment Register</option>
                  <option value="journal">Journal Register</option>
                  <option value="contra">Contra Register</option>
                  <option value="credit_note">Credit Note Register</option>
                  <option value="debit_note">Debit Note Register</option>
                </select>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl(`/reports/register/pdf?financial_year_id=${regData.financial_year_id}&voucher_type=${regVoucherType}`); setPreviewTitle(`${regVoucherType} Register — ${regData.financial_year_name}`); }} />
                  <button onClick={() => downloadFile(`/reports/register/pdf?financial_year_id=${regData.financial_year_id}&voucher_type=${regVoucherType}`, `register-${regVoucherType}-${regData.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">PDF</button>
                  <button onClick={() => downloadFile(`/reports/register/xlsx?financial_year_id=${regData.financial_year_id}&voucher_type=${regVoucherType}`, `register-${regVoucherType}-${regData.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Excel</button>
                </div>
              </div>
              {regData.entries.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No entries found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">Date</th>
                      <th className="pb-1">Voucher No</th>
                      <th className="pb-1">Party</th>
                      <th className="pb-1">Narration</th>
                      <th className="pb-1 text-right">Debit (₹)</th>
                      <th className="pb-1 text-right">Credit (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regData.entries.map((e, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                        <td className="py-1">{toDisplayDate(e.voucher_date)}</td>
                        <td className="py-1">{e.voucher_number}</td>
                        <td className="py-1">{e.party_name || ""}</td>
                        <td className="py-1 max-w-xs truncate text-slate-500 dark:text-[#94a3b8]">{e.narration || ""}</td>
                        <td className="py-1 text-right">{e.debit > 0 ? `₹${fmt(e.debit)}` : ""}</td>
                        <td className="py-1 text-right">{e.credit > 0 ? `₹${fmt(e.credit)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-[#252530] font-medium">
                      <td className="py-1" colSpan={4}>Total</td>
                      <td className="py-1 text-right">₹{fmt(regData.total_debit)}</td>
                      <td className="py-1 text-right">₹{fmt(regData.total_credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* TDS/TCS Summary */}
          {tdsData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  {tdsData.financial_year_name} — {toDisplayDate(tdsData.start_date)} to {toDisplayDate(tdsData.end_date)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setTdsTcsType("tds"); if (selectedFy) fetchReport("tds-tcs", selectedFy, "tds"); }}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                      tdsTcsType === "tds"
                        ? "border-brand-600 dark:border-violet-500/50 bg-brand-50 dark:bg-violet-500/10 text-brand-700 dark:text-violet-400"
                        : "border-slate-300 dark:border-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                    }`}
                  >
                    TDS
                  </button>
                  <button
                    onClick={() => { setTdsTcsType("tcs"); if (selectedFy) fetchReport("tds-tcs", selectedFy, "tcs"); }}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                      tdsTcsType === "tcs"
                        ? "border-brand-600 dark:border-violet-500/50 bg-brand-50 dark:bg-violet-500/10 text-brand-700 dark:text-violet-400"
                        : "border-slate-300 dark:border-[#252530] text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
                    }`}
                  >
                    TCS
                  </button>
                  <PreviewBtn onClick={() => { setPreviewUrl(`/reports/tds-tcs-summary/pdf?financial_year_id=${tdsData.financial_year_id}&tds_tcs_type=${tdsTcsType}`); setPreviewTitle(`${tdsTcsType.toUpperCase()} Summary — ${tdsData.financial_year_name}`); }} />
                  <button onClick={() => downloadFile(`/reports/tds-tcs-summary/pdf?financial_year_id=${tdsData.financial_year_id}&tds_tcs_type=${tdsTcsType}`, `${tdsTcsType}-summary-${tdsData.financial_year_name}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">PDF</button>
                  <button onClick={() => downloadFile(`/reports/tds-tcs-summary/xlsx?financial_year_id=${tdsData.financial_year_id}&tds_tcs_type=${tdsTcsType}`, `${tdsTcsType}-summary-${tdsData.financial_year_name}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Excel</button>
                </div>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] px-3 py-2">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Total Entries</span>
                  <p className="text-lg font-bold">{tdsData.total_entries}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] px-3 py-2">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Total Base Amount</span>
                  <p className="text-lg font-bold">₹{fmt(tdsData.total_base_amount)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] px-3 py-2">
                  <span className="text-slate-500 dark:text-[#94a3b8]">Total Tax</span>
                  <p className="text-lg font-bold text-violet-600 dark:text-violet-400">₹{fmt(tdsData.total_tax_amount)}</p>
                </div>
              </div>
              <div className="mb-3 flex gap-4 text-xs text-slate-500 dark:text-[#94a3b8]">
                <span>Pending: {tdsData.pending_count}</span>
                <span>Deposited: {tdsData.deposited_count}</span>
                <span>Filed: {tdsData.filed_count}</span>
              </div>
              {tdsData.party_lines.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No {tdsTcsType.toUpperCase()} entries found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">Party</th>
                      <th className="pb-1">Section</th>
                      <th className="pb-1">Description</th>
                      <th className="pb-1 text-right">Entries</th>
                      <th className="pb-1 text-right">Base Amount (₹)</th>
                      <th className="pb-1 text-right">Tax (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tdsData.party_lines.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                        <td className="py-1 font-medium">{l.party_name}</td>
                        <td className="py-1">{l.section_code}</td>
                        <td className="py-1 text-slate-500 dark:text-[#94a3b8]">{l.section_name}</td>
                        <td className="py-1 text-right">{l.entry_count}</td>
                        <td className="py-1 text-right">₹{fmt(l.total_base_amount)}</td>
                        <td className="py-1 text-right font-medium">₹{fmt(l.total_tax_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-[#252530] font-medium">
                      <td className="py-1" colSpan={3}>Total</td>
                      <td className="py-1 text-right">{tdsData.total_entries}</td>
                      <td className="py-1 text-right">₹{fmt(tdsData.total_base_amount)}</td>
                      <td className="py-1 text-right">₹{fmt(tdsData.total_tax_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* Stock Summary */}
          {stockSummaryData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Current stock balances</p>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl("/reports/stock-summary/pdf"); setPreviewTitle("Stock Summary"); }} />
                  <button onClick={() => downloadFile("/reports/stock-summary/pdf", "stock-summary.pdf")} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download PDF</button>
                  <button onClick={() => downloadFile("/reports/stock-summary/xlsx", "stock-summary.xlsx")} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download Excel</button>
                </div>
              </div>
              {stockSummaryData.lines.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No stock items found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">Item</th>
                      <th className="pb-1 text-right">Quantity</th>
                      <th className="pb-1 text-right">Avg Rate (₹)</th>
                      <th className="pb-1 text-right">Total Value (₹)</th>
                      <th className="pb-1">Valuation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockSummaryData.lines.map((l) => (
                      <tr key={l.stock_item_id} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                        <td className="py-1 font-medium">{l.stock_item_name}</td>
                        <td className="py-1 text-right">{l.quantity.toFixed(3)}</td>
                        <td className="py-1 text-right">₹{fmt(l.avg_rate)}</td>
                        <td className="py-1 text-right">₹{fmt(l.total_value)}</td>
                        <td className="py-1 text-xs text-slate-500 dark:text-[#94a3b8]">{l.valuation_method === "weighted_avg" ? "Weighted Avg" : "FIFO"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-[#252530] font-medium">
                      <td className="py-1">Total</td>
                      <td className="py-1 text-right">{stockSummaryData.total_quantity.toFixed(3)}</td>
                      <td></td>
                      <td className="py-1 text-right">₹{fmt(stockSummaryData.total_value)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* Stock Movement */}
          {stockMovementData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Opening / Inward / Outward / Closing</p>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl("/reports/stock-movement/pdf"); setPreviewTitle("Stock Movement"); }} />
                  <button onClick={() => downloadFile("/reports/stock-movement/pdf", "stock-movement.pdf")} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download PDF</button>
                  <button onClick={() => downloadFile("/reports/stock-movement/xlsx", "stock-movement.xlsx")} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download Excel</button>
                </div>
              </div>
              {stockMovementData.lines.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No stock items found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">Item</th>
                      <th className="pb-1 text-right">Opening Qty</th>
                      <th className="pb-1 text-right">Inward Qty</th>
                      <th className="pb-1 text-right">Outward Qty</th>
                      <th className="pb-1 text-right">Closing Qty</th>
                      <th className="pb-1 text-right">Closing Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockMovementData.lines.map((l) => (
                      <tr key={l.stock_item_id} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                        <td className="py-1 font-medium">{l.stock_item_name}</td>
                        <td className="py-1 text-right">{l.opening_qty.toFixed(3)}</td>
                        <td className="py-1 text-right text-emerald-600 dark:text-emerald-400">{l.inward_qty.toFixed(3)}</td>
                        <td className="py-1 text-right text-red-600 dark:text-red-400">{l.outward_qty.toFixed(3)}</td>
                        <td className="py-1 text-right font-medium">{l.closing_qty.toFixed(3)}</td>
                        <td className="py-1 text-right">₹{fmt(l.closing_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Stock Ageing */}
          {stockAgeingData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">How long items have been in stock</p>
                <div className="flex gap-2">
                  <PreviewBtn onClick={() => { setPreviewUrl("/reports/stock-ageing/pdf"); setPreviewTitle("Stock Ageing"); }} />
                  <button onClick={() => downloadFile("/reports/stock-ageing/pdf", "stock-ageing.pdf")} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download PDF</button>
                  <button onClick={() => downloadFile("/reports/stock-ageing/xlsx", "stock-ageing.xlsx")} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Download Excel</button>
                </div>
              </div>
              {stockAgeingData.lines.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-[#64748b]">No stock items found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">Item</th>
                      <th className="pb-1 text-right">Quantity</th>
                      <th className="pb-1 text-right">Avg Rate (₹)</th>
                      <th className="pb-1 text-right">Value (₹)</th>
                      <th className="pb-1">Last Entry</th>
                      <th className="pb-1 text-right">Days</th>
                      <th className="pb-1">Ageing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockAgeingData.lines.map((l) => (
                      <tr key={l.stock_item_id} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                        <td className="py-1 font-medium">{l.stock_item_name}</td>
                        <td className="py-1 text-right">{l.quantity.toFixed(3)}</td>
                        <td className="py-1 text-right">₹{fmt(l.avg_rate)}</td>
                        <td className="py-1 text-right">₹{fmt(l.total_value)}</td>
                        <td className="py-1 text-slate-500 dark:text-[#94a3b8]">{l.last_entry_date ? toDisplayDate(l.last_entry_date) : "—"}</td>
                        <td className="py-1 text-right">{l.days_since_entry ?? "—"}</td>
                        <td className="py-1">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            l.ageing_bucket === "0-30 days" ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : l.ageing_bucket === "31-60 days" ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : l.ageing_bucket === "61-90 days" ? "bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400"
                            : l.ageing_bucket === "90+ days" ? "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400"
                            : "bg-slate-100 dark:bg-[#252530] text-slate-500 dark:text-[#94a3b8]"
                          }`}>
                            {l.ageing_bucket}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-[#252530] font-medium">
                      <td className="py-1">Total</td>
                      <td className="py-1 text-right">{stockAgeingData.total_quantity.toFixed(3)}</td>
                      <td></td>
                      <td className="py-1 text-right">₹{fmt(stockAgeingData.total_value)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Ledger Detail Modal (Drill-down) ────────────────────────── */}
      {showLedgerDetail && ledgerTx && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-8"
          onClick={(e) => { if (e.target === e.currentTarget) closeLedgerDetail(); }}>
          <div className="w-full max-w-5xl mx-4 rounded-xl bg-white dark:bg-[#18181f] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9]">{ledgerTx.ledger_name}</h3>
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                  Opening: ₹{fmt(ledgerTx.opening_balance)} {ledgerTx.opening_balance_type} &middot;
                  Closing: ₹{fmt(ledgerTx.closing_balance)} {ledgerTx.closing_balance_type} &middot;
                  Total Dr: ₹{fmt(ledgerTx.total_debit)} &middot; Total Cr: ₹{fmt(ledgerTx.total_credit)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PreviewBtn onClick={() => { setPreviewUrl(`/reports/ledger-transactions/pdf?ledger_id=${ledgerTx.ledger_id}&financial_year_id=${selectedFy}`); setPreviewTitle(`${ledgerTx.ledger_name} Transactions`); }} />
                <button onClick={() => downloadFile(`/reports/ledger-transactions/pdf?ledger_id=${ledgerTx.ledger_id}&financial_year_id=${selectedFy}`, `ledger-${ledgerTx.ledger_name}-${selectedFy?.slice(0,8)}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">PDF</button>
                <button onClick={() => downloadFile(`/reports/ledger-transactions/xlsx?ledger_id=${ledgerTx.ledger_id}&financial_year_id=${selectedFy}`, `ledger-${ledgerTx.ledger_name}-${selectedFy?.slice(0,8)}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Excel</button>
                <button onClick={closeLedgerDetail} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]">Close</button>
              </div>
            </div>

            {ledgerDetailLoading ? (
              <p className="p-6 text-sm text-slate-500 dark:text-[#94a3b8]">Loading transactions…</p>
            ) : (
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-[#18181f]">
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8] border-b border-slate-200 dark:border-[#1e1e28]">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Voucher#</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Party</th>
                      <th className="px-4 py-2">Narration</th>
                      <th className="px-4 py-2 text-right">Debit</th>
                      <th className="px-4 py-2 text-right">Credit</th>
                      <th className="px-4 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100 dark:border-[#1e1e28]/50 font-medium text-slate-500 dark:text-[#94a3b8]">
                      <td className="px-4 py-2" colSpan={5}>Opening Balance</td>
                      <td className="px-4 py-2 text-right"></td>
                      <td className="px-4 py-2 text-right"></td>
                      <td className="px-4 py-2 text-right">
                        ₹{fmt(ledgerTx.opening_balance)} {ledgerTx.opening_balance_type}
                      </td>
                    </tr>
                    {ledgerTx.transactions.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-[#1e1e28]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252530]/50"
                        onClick={() => fetchVoucherDetail(t.voucher_id)}>
                        <td className="px-4 py-1.5">{t.voucher_date}</td>
                        <td className="px-4 py-1.5 font-medium text-brand-600 dark:text-violet-400">{t.voucher_number}</td>
                        <td className="px-4 py-1.5 capitalize">{t.voucher_type}</td>
                        <td className="px-4 py-1.5 text-slate-600 dark:text-[#94a3b8]">{t.party_name || "—"}</td>
                        <td className="px-4 py-1.5 text-slate-600 dark:text-[#94a3b8] max-w-[200px] truncate">{t.narration || "—"}</td>
                        <td className="px-4 py-1.5 text-right">{t.debit > 0 ? `₹${fmt(t.debit)}` : ""}</td>
                        <td className="px-4 py-1.5 text-right">{t.credit > 0 ? `₹${fmt(t.credit)}` : ""}</td>
                        <td className="px-4 py-1.5 text-right">₹{fmt(t.running_balance)}</td>
                      </tr>
                    ))}
                    {ledgerTx.transactions.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 dark:text-[#64748b]">No transactions in this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Voucher Detail Modal (2nd level drill-down) ─────────────── */}
      {voucherDetail && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 py-8"
          onClick={(e) => { if (e.target === e.currentTarget) setVoucherDetail(null); }}>
          <div className="w-full max-w-3xl mx-4 rounded-xl bg-white dark:bg-[#18181f] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9] capitalize">{voucherDetail.voucher_type} — {voucherDetail.voucher_number}</h3>
                <p className="text-xs text-slate-500 dark:text-[#94a3b8]">{voucherDetail.voucher_date}{voucherDetail.party_name ? ` · ${voucherDetail.party_name}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <PreviewBtn onClick={() => { setPreviewUrl(`/vouchers/${voucherDetail.id}/pdf`); setPreviewTitle(`${voucherDetail.voucher_type} ${voucherDetail.voucher_number}`); }} />
                <button onClick={() => downloadFile(`/vouchers/${voucherDetail.id}/pdf`, `${voucherDetail.voucher_type}-${voucherDetail.voucher_number}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Print PDF</button>
                <button onClick={() => setVoucherDetail(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]">Close</button>
              </div>
            </div>
            <div className="px-6 py-4">
              {voucherDetail.narration && (
                <p className="mb-4 text-sm text-slate-600 dark:text-[#94a3b8] italic">{voucherDetail.narration}</p>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8] border-b border-slate-200 dark:border-[#1e1e28]">
                    <th className="pb-2">Ledger</th>
                    <th className="pb-2 text-right">Debit</th>
                    <th className="pb-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {voucherDetail.lines.map((l, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-[#1e1e28]/50">
                      <td className="py-1.5">{l.ledger_name}</td>
                      <td className="py-1.5 text-right">{l.debit > 0 ? `₹${fmt(l.debit)}` : ""}</td>
                      <td className="py-1.5 text-right">{l.credit > 0 ? `₹${fmt(l.credit)}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium border-t-2 border-slate-300 dark:border-[#252530]">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right">₹{fmt(voucherDetail.lines.reduce((s, l) => s + l.debit, 0))}</td>
                    <td className="pt-2 text-right">₹{fmt(voucherDetail.lines.reduce((s, l) => s + l.credit, 0))}</td>
                  </tr>
                  {voucherDetail.grand_total > 0 && (
                    <tr className="font-bold">
                      <td className="pt-1">Grand Total</td>
                      <td colSpan={2} className="pt-1 text-right">₹{fmt(voucherDetail.grand_total)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <PdfPreviewModal
          url={previewUrl}
          title={previewTitle}
          onClose={() => { setPreviewUrl(null); setPreviewTitle(""); }}
        />
      )}
    </div>
  );
}
