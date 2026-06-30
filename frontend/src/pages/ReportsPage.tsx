import { useEffect, useState } from "react";
import { api } from "../api/client";
import { toDisplayDate } from "../utils/dateUtils";

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

type Tab = "trial-balance" | "profit-and-loss" | "balance-sheet" | "cash-flow" | "aging" | "outstanding" | "register";

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

function GroupTable({ groups }: { groups: ReportGroup[] }) {
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
          <GroupRows key={g.group_name} group={g} />
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({ group }: { group: ReportGroup }) {
  return (
    <>
      <tr className="border-t border-slate-200 dark:border-[#1e1e28] bg-slate-50 dark:bg-[#18181f]/80">
        <td colSpan={4} className="py-1 font-semibold text-slate-800 dark:text-[#f1f5f9]">{group.group_name}</td>
        <td className="py-1 text-right font-medium">₹{fmt(group.total)}</td>
      </tr>
      {group.ledgers.map((l) => (
        <tr key={l.ledger_id} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
          <td className="py-1 pl-4">{l.ledger_name}</td>
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
  const [selectedFy, setSelectedFy] = useState("");
  const [tab, setTab] = useState<Tab>("trial-balance");
  const [loading, setLoading] = useState(false);
  const [tbData, setTbData] = useState<TrialBalanceData | null>(null);
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [bsData, setBsData] = useState<BSData | null>(null);
  const [cfData, setCfData] = useState<CashFlowData | null>(null);
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  const [osData, setOsData] = useState<OutstandingData | null>(null);
  const [regData, setRegData] = useState<RegisterData | null>(null);
  const [agingType, setAgingType] = useState<"receivable" | "payable">("receivable");
  const [regVoucherType, setRegVoucherType] = useState("sales");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<FinancialYear[]>("/coa/financial-years").then((data) => {
      setFys(data);
      if (data.length > 0) setSelectedFy(data[0].id);
    });
  }, []);

  const fetchReport = (tabName: Tab, fyId: string, subType?: string, subVt?: string) => {
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

    let endpoint = `/reports/${tabName}?financial_year_id=${fyId}`;
    if (tabName === "aging") endpoint += `&type=${subType || agingType}`;
    if (tabName === "register") endpoint += `&voucher_type=${subVt || regVoucherType}`;

    api.get<any>(endpoint)
      .then((data) => {
        if (tabName === "trial-balance") setTbData(data as TrialBalanceData);
        else if (tabName === "profit-and-loss") setPnlData(data as PnLData);
        else if (tabName === "balance-sheet") setBsData(data as BSData);
        else if (tabName === "cash-flow") setCfData(data as CashFlowData);
        else if (tabName === "aging") setAgingData(data as AgingData);
        else if (tabName === "outstanding") setOsData(data as OutstandingData);
        else if (tabName === "register") setRegData(data as RegisterData);
      })
      .catch((err: any) => setError(err?.detail || "Failed to load report"))
      .finally(() => setLoading(false));
  };

  const handleTab = (t: Tab) => {
    setTab(t);
    if (selectedFy) fetchReport(t, selectedFy);
  };

  const handleFy = (id: string) => {
    setSelectedFy(id);
    if (id) fetchReport(tab, id);
  };

  useEffect(() => {
    if (selectedFy) fetchReport(tab, selectedFy);
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "trial-balance", label: "Trial Balance" },
    { key: "profit-and-loss", label: "Profit & Loss" },
    { key: "balance-sheet", label: "Balance Sheet" },
    { key: "cash-flow", label: "Cash Flow" },
    { key: "aging", label: "Aging" },
    { key: "outstanding", label: "Outstanding" },
    { key: "register", label: "Register" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Reports</h2>
        <select
          value={selectedFy}
          onChange={(e) => handleFy(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
        >
          <option value="">Select Financial Year</option>
          {fys.map((fy) => (
            <option key={fy.id} value={fy.id}>{fy.name} ({toDisplayDate(fy.start_date)} to {toDisplayDate(fy.end_date)})</option>
          ))}
        </select>
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
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading…</p>
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
                    <tr key={l.ledger_id} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                      <td className="py-1">{l.ledger_name}</td>
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
                  <GroupTable groups={pnlData.income_groups} />
                  <p className="mt-2 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Total Income: ₹{fmt(pnlData.total_income)}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Expenses</h3>
                  <GroupTable groups={pnlData.expense_groups} />
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
                  <GroupTable groups={bsData.asset_groups} />
                  <p className="mt-2 text-right text-sm font-medium">
                    Total Assets: ₹{fmt(bsData.total_assets)}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Liabilities & Capital</h3>
                  <GroupTable groups={bsData.liability_groups} />
                  <GroupTable groups={bsData.capital_groups} />
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
        </div>
      )}
    </div>
  );
}
