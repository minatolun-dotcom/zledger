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

type Tab = "trial-balance" | "profit-and-loss" | "balance-sheet";

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
  if (groups.length === 0) return <p className="py-2 text-sm text-slate-400">No data.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium uppercase text-slate-500">
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
      <tr className="border-t border-slate-200 bg-slate-50">
        <td colSpan={4} className="py-1 font-semibold text-slate-800">{group.group_name}</td>
        <td className="py-1 text-right font-medium">₹{fmt(group.total)}</td>
      </tr>
      {group.ledgers.map((l) => (
        <tr key={l.ledger_id} className="border-t border-slate-100">
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
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<FinancialYear[]>("/coa/financial-years").then((data) => {
      setFys(data);
      if (data.length > 0) setSelectedFy(data[0].id);
    });
  }, []);

  const fetchReport = (tabName: Tab, fyId: string) => {
    if (!fyId) return;
    setLoading(true);
    setError("");
    setTbData(null);
    setPnlData(null);
    setBsData(null);

    const endpoint = `/reports/${tabName}?financial_year_id=${fyId}`;
    api.get<TrialBalanceData | PnLData | BSData>(endpoint)
      .then((data) => {
        if (tabName === "trial-balance") setTbData(data as TrialBalanceData);
        else if (tabName === "profit-and-loss") setPnlData(data as PnLData);
        else setBsData(data as BSData);
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
  ];

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h2 className="text-lg font-bold text-slate-900">Reports</h2>
        <select
          value={selectedFy}
          onChange={(e) => handleFy(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">Select Financial Year</option>
          {fys.map((fy) => (
            <option key={fy.id} value={fy.id}>{fy.name} ({toDisplayDate(fy.start_date)} to {toDisplayDate(fy.end_date)})</option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4">
          {/* Trial Balance */}
          {tbData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {tbData.financial_year_name} — {toDisplayDate(tbData.start_date)} to {toDisplayDate(tbData.end_date)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadFile(`/reports/trial-balance/pdf?financial_year_id=${tbData.financial_year_id}`, `trial-balance-${tbData.financial_year_name}.pdf`)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => downloadFile(`/reports/trial-balance/xlsx?financial_year_id=${tbData.financial_year_id}`, `trial-balance-${tbData.financial_year_name}.xlsx`)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500">
                    <th className="pb-1">Ledger</th>
                    <th className="pb-1">Group</th>
                    <th className="pb-1 text-right">Debit (₹)</th>
                    <th className="pb-1 text-right">Credit (₹)</th>
                    <th className="pb-1 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {tbData.lines.map((l) => (
                    <tr key={l.ledger_id} className="border-t border-slate-100">
                      <td className="py-1">{l.ledger_name}</td>
                      <td className="py-1 text-slate-500">{l.group_name}</td>
                      <td className="py-1 text-right">{l.total_debit > 0 ? `₹${fmt(l.total_debit)}` : ""}</td>
                      <td className="py-1 text-right">{l.total_credit > 0 ? `₹${fmt(l.total_credit)}` : ""}</td>
                      <td className="py-1 text-right">₹{fmt(l.closing_balance)} {l.closing_balance_type}</td>
                    </tr>
                  ))}
                  {tbData.lines.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">No data.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-medium">
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
                <p className="text-xs text-slate-500">
                  {pnlData.financial_year_name} — {toDisplayDate(pnlData.start_date)} to {toDisplayDate(pnlData.end_date)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadFile(`/reports/profit-and-loss/pdf?financial_year_id=${pnlData.financial_year_id}`, `profit-and-loss-${pnlData.financial_year_name}.pdf`)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => downloadFile(`/reports/profit-and-loss/xlsx?financial_year_id=${pnlData.financial_year_id}`, `profit-and-loss-${pnlData.financial_year_name}.xlsx`)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Income</h3>
                  <GroupTable groups={pnlData.income_groups} />
                  <p className="mt-2 text-right text-sm font-medium text-emerald-700">
                    Total Income: ₹{fmt(pnlData.total_income)}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Expenses</h3>
                  <GroupTable groups={pnlData.expense_groups} />
                  <p className="mt-2 text-right text-sm font-medium text-red-700">
                    Total Expenses: ₹{fmt(pnlData.total_expenses)}
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3 text-right">
                <span className={`text-lg font-bold ${pnlData.is_profit ? "text-emerald-700" : "text-red-700"}`}>
                  {pnlData.is_profit ? "Net Profit" : "Net Loss"}: ₹{fmt(Math.abs(pnlData.net_profit))}
                </span>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {bsData && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {bsData.financial_year_name} — {toDisplayDate(bsData.start_date)} to {toDisplayDate(bsData.end_date)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadFile(`/reports/balance-sheet/pdf?financial_year_id=${bsData.financial_year_id}`, `balance-sheet-${bsData.financial_year_name}.pdf`)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => downloadFile(`/reports/balance-sheet/xlsx?financial_year_id=${bsData.financial_year_id}`, `balance-sheet-${bsData.financial_year_name}.xlsx`)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Download Excel
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Assets</h3>
                  <GroupTable groups={bsData.asset_groups} />
                  <p className="mt-2 text-right text-sm font-medium">
                    Total Assets: ₹{fmt(bsData.total_assets)}
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Liabilities & Capital</h3>
                  <GroupTable groups={bsData.liability_groups} />
                  <GroupTable groups={bsData.capital_groups} />
                  <p className="mt-2 text-right text-sm font-medium">
                    Total: ₹{fmt(bsData.total_liabilities_and_capital)}
                  </p>
                </div>
              </div>
              <div className={`mt-4 border-t pt-3 text-right text-lg font-bold ${
                Math.abs(bsData.total_assets - bsData.total_liabilities_and_capital) < 0.01
                  ? "text-emerald-700" : "text-red-700"
              }`}>
                {Math.abs(bsData.total_assets - bsData.total_liabilities_and_capital) < 0.01
                  ? "Balance Sheet is balanced ✓"
                  : `Difference: ₹${fmt(Math.abs(bsData.total_assets - bsData.total_liabilities_and_capital))}`
                }
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
