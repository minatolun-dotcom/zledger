import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { toDisplayDate } from "../utils/dateUtils";
import Select from "../components/Select";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";

interface StatementLine {
  id: string;
  ledger_id: string;
  transaction_date: string;
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  is_reconciled: boolean;
  voucher_id: string | null;
  reconciled_at: string | null;
  created_at: string | null;
}

interface Ledger {
  id: string;
  name: string;
  group_id: string;
  is_active: boolean;
}

interface MatchCandidate {
  voucher_id: string;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  narration: string | null;
  amount: number;
  direction: string;
}

interface Summary {
  total_lines: number;
  reconciled_count: number;
  unreconciled_count: number;
  total_debit: number;
  total_credit: number;
  matched_debit: number;
  matched_credit: number;
}

export default function BankReconciliationPage() {
  const toast = useToastStore();
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<string>("");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Matching state
  const [matchLine, setMatchLine] = useState<StatementLine | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  // Filter state
  const [filter, setFilter] = useState<"all" | "reconciled" | "unreconciled">("all");

  useEffect(() => {
    api.get<Ledger[]>("/coa/ledgers?group_code=GRP_BANK_ACCOUNTS").then((data) => {
      setLedgers(data.filter((l) => l.is_active));
    });
  }, []);

  const loadLines = () => {
    if (!selectedLedger) return;
    setLoading(true);
    const params = new URLSearchParams({ ledger_id: selectedLedger });
    if (filter === "reconciled") params.set("reconciled", "true");
    else if (filter === "unreconciled") params.set("reconciled", "false");

    Promise.all([
      api.get<StatementLine[]>(`/bank-reconciliation/lines?${params}`),
      api.get<Summary>(`/bank-reconciliation/summary?ledger_id=${selectedLedger}`),
    ])
      .then(([linesData, summaryData]) => {
        setLines(linesData);
        setSummary(summaryData);
      })
      .catch((err) => toast.error(err?.message || "Failed to load data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadLines(); }, [selectedLedger, filter]);

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !selectedLedger) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(
        `/bank-reconciliation/import?ledger_id=${selectedLedger}`,
        formData,
      );
      fileRef.current.value = "";
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!await showConfirm("Delete this statement line?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/bank-reconciliation/lines/${lineId}`);
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  const handleSuggest = async (line: StatementLine) => {
    setMatchLine(line);
    setSuggestionLoading(true);
    setCandidates([]);
    try {
      const data = await api.get<MatchCandidate[]>(
        `/bank-reconciliation/suggest/${line.id}`,
      );
      setCandidates(data);
    } catch (err: any) {
      toast.error(err?.message || "Failed to get suggestions");
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleMatch = async (voucherId: string) => {
    if (!matchLine) return;
    try {
      await api.post("/bank-reconciliation/match", {
        statement_line_id: matchLine.id,
        voucher_id: voucherId,
      });
      setMatchLine(null);
      setCandidates([]);
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to match");
    }
  };

  const handleUnmatch = async (lineId: string) => {
    try {
      await api.post("/bank-reconciliation/unmatch", {
        statement_line_id: lineId,
      });
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to unmatch");
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ledgerOptions = [
    { value: "", label: "Select a bank ledger…" },
    ...ledgers.map((l) => ({ value: l.id, label: l.name })),
  ];

  useEffect(() => {
    if (!matchLine) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setMatchLine(null); setCandidates([]); }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [matchLine]);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Bank Reconciliation</h2>
      </div>

      {/* Ledger selector + Import */}
      <div className="mt-4 flex items-end gap-4">
        <div className="flex-1">
          <Select
            value={selectedLedger}
            onChange={setSelectedLedger}
            options={ledgerOptions}
            label="Bank Account"
            className="w-full"
          />
        </div>
        {selectedLedger && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Import CSV</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="mt-1 block rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={handleImport}
              disabled={importing || !fileRef.current?.files?.[0]}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </>
        )}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 transition-colors hover:border-slate-300 dark:hover:border-[#282832]">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Total Lines</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9] tabular-nums">{summary.total_lines}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 transition-colors hover:border-slate-300 dark:hover:border-[#282832]">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Reconciled</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{summary.reconciled_count}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 transition-colors hover:border-slate-300 dark:hover:border-[#282832]">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Unreconciled</div>
            <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{summary.unreconciled_count}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 transition-colors hover:border-slate-300 dark:hover:border-[#282832]">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">Matched Amount</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9] tabular-nums">
              ₹{fmt(summary.matched_debit + summary.matched_credit)}
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {selectedLedger && (
        <div className="mt-4 flex gap-2">
          {(["all", "unreconciled", "reconciled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filter === f
                  ? "bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                  : "text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832]"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Statement lines table */}
      {loading ? (
        <ListSkeleton title="Bank Reconciliation" cols={4} />
      ) : selectedLedger ? (
        <div className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1a1a24]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">
                <th className="px-3 py-2.5 w-[100px]">Date</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 w-[120px]">Ref</th>
                <th className="px-3 py-2.5 w-[110px] text-right">Debit</th>
                <th className="px-3 py-2.5 w-[110px] text-right">Credit</th>
                <th className="px-3 py-2.5 w-[110px] text-right">Balance</th>
                <th className="px-3 py-2.5 w-[90px] text-center">Status</th>
                <th className="px-3 py-2.5 w-[100px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let runningBalance = 0;
                return lines.map((line) => {
                  runningBalance += line.debit - line.credit;
                  const displayBalance = line.balance != null ? line.balance : runningBalance;
                  return (
                    <tr key={line.id} className="border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50/50 dark:hover:bg-[#1a1a24]/50 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 dark:text-[#cbd5e1]">{toDisplayDate(line.transaction_date)}</td>
                      <td className="px-3 py-2.5 max-w-[200px] truncate text-slate-900 dark:text-[#f1f5f9] font-medium" title={line.description}>{line.description}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-[#94a3b8]">{line.reference || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {line.debit > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">₹{fmt(line.debit)}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-[#475569]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {line.credit > 0 ? (
                          <span className="text-red-600 dark:text-red-400">₹{fmt(line.credit)}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-[#475569]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-[#cbd5e1]">
                        ₹{fmt(displayBalance)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {line.is_reconciled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            Matched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Open
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!line.is_reconciled && (
                            <button
                              onClick={() => handleSuggest(line)}
                              className="rounded px-2 py-0.5 text-xs font-medium text-brand-600 dark:text-blue-400 hover:bg-brand-50 dark:hover:bg-blue-500/10 transition-colors"
                            >
                              Match
                            </button>
                          )}
                          {line.is_reconciled && (
                            <button
                              onClick={() => handleUnmatch(line.id)}
                              className="rounded px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                            >
                              Unmatch
                            </button>
                          )}
                          {!line.is_reconciled && (
                            <button
                              onClick={() => handleDeleteLine(line.id)}
                              className="rounded px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400 dark:text-[#64748b]">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-8 w-8 text-slate-300 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span>{filter === "all" ? "No statement lines. Import a CSV to get started." : `No ${filter} lines.`}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <p className="mt-8 text-center text-slate-400 dark:text-[#64748b]">Select a bank ledger to begin reconciliation.</p>
      )}

      {/* Match modal */}
      {matchLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) { setMatchLine(null); setCandidates([]); } }}>
          <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white dark:bg-[#16161f] p-6 shadow-xl dark:shadow-dark-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Match Transaction</h3>
              <button onClick={() => { setMatchLine(null); setCandidates([]); }} className="text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#e2e8f0]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-slate-50 dark:bg-[#282832] p-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="font-medium">Date:</span> {toDisplayDate(matchLine.transaction_date)}</div>
                <div><span className="font-medium">Description:</span> {matchLine.description}</div>
                <div>
                  <span className="font-medium">Amount:</span>{" "}
                  <span className="font-mono">
                    {matchLine.credit > 0 ? `₹${fmt(matchLine.credit)} (Credit)` : `₹${fmt(matchLine.debit)} (Debit)`}
                  </span>
                </div>
                {matchLine.reference && (
                  <div><span className="font-medium">Reference:</span> {matchLine.reference}</div>
                )}
              </div>
            </div>

            {suggestionLoading ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Searching for matches…</p>
            ) : candidates.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">No matching vouchers found. You may need to create the voucher first.</p>
            ) : (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Matching vouchers:</p>
                <div className="mt-2 space-y-2">
                  {candidates.map((c) => (
                    <div
                      key={c.voucher_id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-[#1a1a24] p-3 hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
                    >
                      <div className="text-sm">
                        <span className="font-medium">{c.voucher_type}</span>{" "}
                        <span className="text-slate-500 dark:text-[#94a3b8]">#{c.voucher_number}</span>
                        <span className="ml-2 text-slate-400 dark:text-[#64748b]">({toDisplayDate(c.voucher_date)})</span>
                        {c.narration && (
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-[#94a3b8] truncate max-w-xs">{c.narration}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">₹{fmt(c.amount)}</span>
                        <button
                          onClick={() => handleMatch(c.voucher_id)}
                          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
                        >
                          Match
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => { setMatchLine(null); setCandidates([]); }}
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#282832]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
