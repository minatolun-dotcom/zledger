import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
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
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<string>("");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
    setError("");
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
      .catch((err) => setError(err?.message || "Failed to load data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadLines(); }, [selectedLedger, filter]);

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !selectedLedger) return;
    setImporting(true);
    setError("");
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
      setError(err?.message || "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!await showConfirm("Delete this statement line?", { danger: true, confirmLabel: "Delete" })) return;
    setError("");
    try {
      await api.del(`/bank-reconciliation/lines/${lineId}`);
      loadLines();
    } catch (err: any) {
      setError(err?.message || "Failed to delete");
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
      setError(err?.message || "Failed to get suggestions");
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleMatch = async (voucherId: string) => {
    if (!matchLine) return;
    setError("");
    try {
      await api.post("/bank-reconciliation/match", {
        statement_line_id: matchLine.id,
        voucher_id: voucherId,
      });
      setMatchLine(null);
      setCandidates([]);
      loadLines();
    } catch (err: any) {
      setError(err?.message || "Failed to match");
    }
  };

  const handleUnmatch = async (lineId: string) => {
    setError("");
    try {
      await api.post("/bank-reconciliation/unmatch", {
        statement_line_id: lineId,
      });
      loadLines();
    } catch (err: any) {
      setError(err?.message || "Failed to unmatch");
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
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
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
                className="mt-1 block rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
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
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Total Lines</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">{summary.total_lines}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Reconciled</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.reconciled_count}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Unreconciled</div>
            <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.unreconciled_count}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Matched Amount</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">
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
                  ? "bg-brand-50 dark:bg-violet-500/10 text-brand-700 dark:text-violet-400"
                  : "text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {/* Statement lines table */}
      {loading ? (
        <ListSkeleton title="Bank Reconciliation" cols={4} />
      ) : selectedLedger ? (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Date</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Ref</th>
                <th className="pb-2 text-right">Debit</th>
                <th className="pb-2 text-right">Credit</th>
                <th className="pb-2 text-right">Balance</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100 dark:border-[#1e1e28] hover:bg-slate-50 dark:hover:bg-[#1e1e28]">
                  <td className="py-2">{toDisplayDate(line.transaction_date)}</td>
                  <td className="py-2 max-w-xs truncate">{line.description}</td>
                  <td className="py-2 text-slate-500 dark:text-[#94a3b8]">{line.reference || "—"}</td>
                  <td className="py-2 text-right font-mono">
                    {line.debit > 0 ? `₹${fmt(line.debit)}` : "—"}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {line.credit > 0 ? `₹${fmt(line.credit)}` : "—"}
                  </td>
                  <td className="py-2 text-right font-mono text-slate-500 dark:text-[#94a3b8]">
                    {line.balance != null ? `₹${fmt(line.balance)}` : "—"}
                  </td>
                  <td className="py-2">
                    {line.is_reconciled ? (
                      <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                        Matched
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                        Open
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!line.is_reconciled && (
                        <button
                          onClick={() => handleSuggest(line)}
                          className="text-xs text-brand-600 dark:text-violet-400 hover:underline"
                        >
                          Match
                        </button>
                      )}
                      {line.is_reconciled && (
                        <button
                          onClick={() => handleUnmatch(line.id)}
                          className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          Unmatch
                        </button>
                      )}
                      {!line.is_reconciled && (
                        <button
                          onClick={() => handleDeleteLine(line.id)}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-[#64748b]">
                    {filter === "all"
                      ? "No statement lines. Import a CSV to get started."
                      : `No ${filter} lines.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-8 text-center text-slate-400 dark:text-[#64748b]">Select a bank ledger to begin reconciliation.</p>
      )}

      {/* Match modal */}
      {matchLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) { setMatchLine(null); setCandidates([]); } }}>
          <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white dark:bg-[#18181f] p-6 shadow-xl dark:shadow-dark-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Match Transaction</h3>
              <button onClick={() => { setMatchLine(null); setCandidates([]); }} className="text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#e2e8f0]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-slate-50 dark:bg-[#252530] p-4 text-sm">
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
                      className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-[#1e1e28] p-3 hover:bg-slate-50 dark:hover:bg-[#1e1e28]"
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
                className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
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
