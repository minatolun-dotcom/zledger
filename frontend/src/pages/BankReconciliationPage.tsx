import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { toDisplayDate } from "../utils/dateUtils";
import Select from "../components/Select";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import PageHeader from "../components/PageHeader";

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
  score: number;
  match_quality: string;
  score_breakdown: Record<string, number>;
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

interface CsvPreview {
  raw_columns: string[];
  detected_mapping: Record<string, string | null>;
  preview_rows: Record<string, string>[];
}

interface ImportResult {
  imported_count: number;
  duplicates_skipped: number;
  total_rows: number;
}

interface AutoReconcileResult {
  total_unreconciled: number;
  matched: number;
  skipped: number;
  results: Array<{
    line_id: string;
    status: string;
    description: string;
    voucher_id?: string;
    voucher_number?: string;
    best_score?: number;
  }>;
}

const FIELD_LABELS: Record<string, string> = {
  date: "Date",
  description: "Description",
  debit: "Debit / Withdrawal",
  credit: "Credit / Deposit",
  reference: "Reference",
  balance: "Running Balance",
};

const REQUIRED_FIELDS = ["date", "description"];

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

  // CSV preview & column mapping state
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string | null>>({});
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Auto-reconcile state
  const [autoReconciling, setAutoReconciling] = useState(false);
  const [autoReconcileResult, setAutoReconcileResult] = useState<AutoReconcileResult | null>(null);
  const [minScore, setMinScore] = useState(80);
  const [showSkipDetails, setShowSkipDetails] = useState(false);

  // Bulk selection state
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());

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

  // ── CSV Preview & Column Mapping ────────────────────────────────────────

  const handleFileSelect = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setPendingFile(file);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const preview = await api.post<CsvPreview>("/bank-reconciliation/preview", formData);
      setCsvPreview(preview);
      setColumnMap({ ...preview.detected_mapping });
      setShowColumnMapper(true);
    } catch (err: any) {
      toast.error(err?.message || "Failed to preview CSV");
    }
  };

  const handleImportWithMapping = async () => {
    if (!pendingFile || !selectedLedger) return;

    // Validate required fields
    const missingRequired = REQUIRED_FIELDS.filter((f) => !columnMap[f]);
    if (missingRequired.length > 0) {
      toast.error(`Missing required fields: ${missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}`);
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const params = new URLSearchParams({
        ledger_id: selectedLedger,
        skip_duplicates: "true",
        column_map: JSON.stringify(columnMap),
      });
      const result = await api.post<ImportResult>(
        `/bank-reconciliation/import?${params}`,
        formData,
      );

      let msg = `Imported ${result.imported_count} rows`;
      if (result.duplicates_skipped > 0) {
        msg += `, skipped ${result.duplicates_skipped} duplicates`;
      }
      toast.success(msg);

      setShowColumnMapper(false);
      setCsvPreview(null);
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  const handleCancelImport = () => {
    setShowColumnMapper(false);
    setCsvPreview(null);
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Existing handlers ──────────────────────────────────────────────────

  const handleDeleteLine = async (lineId: string) => {
    if (!await showConfirm("Delete this statement line?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/bank-reconciliation/lines/${lineId}`);
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  const handleBulkDelete = async () => {
    const unreconciledSelected = [...selectedLines].filter(id => {
      const line = lines.find(l => l.id === id);
      return line && !line.is_reconciled;
    });
    if (unreconciledSelected.length === 0) {
      toast.error("No unreconciled lines selected");
      return;
    }
    if (!await showConfirm(`Delete ${unreconciledSelected.length} statement line(s)?`, { danger: true, confirmLabel: "Delete" })) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>(
        "/bank-reconciliation/lines/bulk-delete",
        { ids: unreconciledSelected },
      );
      if (result.errors.length) {
        toast.error(`${result.errors.length} line(s) could not be deleted`);
      }
      toast.success(`Deleted ${result.processed} line(s)`);
      setSelectedLines(new Set());
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete lines");
    }
  };

  const toggleSelectAll = () => {
    const unreconciledIds = lines.filter(l => !l.is_reconciled).map(l => l.id);
    if (selectedLines.size === unreconciledIds.length) {
      setSelectedLines(new Set());
    } else {
      setSelectedLines(new Set(unreconciledIds));
    }
  };

  const toggleSelectLine = (id: string) => {
    setSelectedLines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  // ── Auto-Reconcile ────────────────────────────────────────────────────

  const handleAutoReconcile = async () => {
    if (!selectedLedger) return;
    setAutoReconciling(true);
    setAutoReconcileResult(null);
    try {
      const result = await api.post<AutoReconcileResult>(
        `/bank-reconciliation/auto-reconcile?ledger_id=${selectedLedger}&min_score=${minScore}`,
      );
      setAutoReconcileResult(result);
      toast.success(`Auto-matched ${result.matched} of ${result.total_unreconciled} unreconciled lines`);
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to auto-reconcile");
    } finally {
      setAutoReconciling(false);
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

  // ── Score badge helper ─────────────────────────────────────────────────

  const ScoreBadge = ({ score, quality }: { score: number; quality: string }) => {
    const colors: Record<string, string> = {
      high: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      medium: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
      low: "bg-slate-100 dark:bg-[#64748b]/10 text-slate-600 dark:text-[#94a3b8]",
      none: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[quality] || colors.low}`}>
        {score > 0 ? `${score}%` : "—"}
      </span>
    );
  };

  return (
    <div>
      <PageHeader title="Bank Reconciliation" />

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
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Import Statement</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={handleFileSelect}
                className="mt-1 block rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-[#64748b]">Accepts CSV, TXT, XLSX, or XLS</p>
            </div>
            <button
              onClick={handleAutoReconcile}
              disabled={autoReconciling || summary?.unreconciled_count === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {autoReconciling ? "Matching…" : "Auto-Match All"}
            </button>
          </>
        )}
      </div>

      {/* Auto-reconcile score threshold */}
      {selectedLedger && summary && summary.unreconciled_count > 0 && (
        <div className="mt-2 flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">
            Min match score:
          </label>
          <input
            type="range"
            min="50"
            max="100"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-xs font-mono text-slate-700 dark:text-[#f1f5f9]">{minScore}%</span>
        </div>
      )}

      {/* Auto-reconcile results */}
      {autoReconcileResult && (() => {
        const matched = autoReconcileResult.results.filter(r => r.status === "matched");
        const belowThreshold = autoReconcileResult.results.filter(r => r.status === "below_threshold");
        const noMatch = autoReconcileResult.results.filter(r => r.status === "no_match");
        const noCandidates = autoReconcileResult.results.filter(r => r.status === "no_candidates");

        return (
          <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Auto-Reconcile Complete
            </div>

            <div className="mt-2 space-y-1 text-xs">
              <p className="text-emerald-700 dark:text-emerald-400">
                ✅ Matched: {matched.length}
              </p>
              {belowThreshold.length > 0 && (
                <p className="text-amber-600 dark:text-amber-400">
                  ⚠️ Below threshold: {belowThreshold.length}
                </p>
              )}
              {noMatch.length > 0 && (
                <p className="text-red-600 dark:text-red-400">
                  ❌ No matching voucher: {noMatch.length}
                </p>
              )}
              {noCandidates.length > 0 && (
                <p className="text-slate-500 dark:text-[#94a3b8]">
                  ⏭️ Skipped (zero amount): {noCandidates.length}
                </p>
              )}
            </div>

            {autoReconcileResult.skipped > 0 && (
              <button
                onClick={() => setShowSkipDetails(!showSkipDetails)}
                className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                {showSkipDetails ? "Hide details" : "Show skip details"}
              </button>
            )}

            {showSkipDetails && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-emerald-200 dark:border-emerald-500/20 bg-white dark:bg-[#16161f] p-2 text-xs">
                {belowThreshold.length > 0 && (
                  <div className="mb-2">
                    <p className="font-medium text-amber-600 dark:text-amber-400">Below Threshold:</p>
                    {belowThreshold.slice(0, 10).map(r => (
                      <p key={r.line_id} className="ml-2 text-slate-600 dark:text-[#94a3b8]">
                        • {r.description} (score: {r.best_score})
                      </p>
                    ))}
                    {belowThreshold.length > 10 && (
                      <p className="ml-2 text-slate-400">...and {belowThreshold.length - 10} more</p>
                    )}
                  </div>
                )}
                {noMatch.length > 0 && (
                  <div className="mb-2">
                    <p className="font-medium text-red-600 dark:text-red-400">No Matching Voucher:</p>
                    {noMatch.slice(0, 10).map(r => (
                      <p key={r.line_id} className="ml-2 text-slate-600 dark:text-[#94a3b8]">
                        • {r.description}
                      </p>
                    ))}
                    {noMatch.length > 10 && (
                      <p className="ml-2 text-slate-400">...and {noMatch.length - 10} more</p>
                    )}
                  </div>
                )}
                {noCandidates.length > 0 && (
                  <div>
                    <p className="font-medium text-slate-500 dark:text-[#94a3b8]">Zero Amount (skipped):</p>
                    {noCandidates.slice(0, 5).map(r => (
                      <p key={r.line_id} className="ml-2 text-slate-400">
                        • {r.description}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setAutoReconcileResult(null)}
              className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Dismiss
            </button>
          </div>
        );
      })()}

      {/* Summary cards */}
      {summary && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 transition-colors hover:border-slate-300 dark:hover:border-[#282832]">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Total Lines</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9] tabular-nums">{summary.total_lines}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 transition-colors hover:border-slate-300 dark:hover:border-[#282832]">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Reconciled</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{summary.reconciled_count}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 transition-colors hover:border-slate-300 dark:hover:border-[#282832]">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Unreconciled</div>
            <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{summary.unreconciled_count}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 transition-colors hover:border-slate-300 dark:hover:border-[#282832]">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Matched Amount</div>
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
                  : "text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#282832]"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          {selectedLines.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="ml-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
            >
              Delete ({selectedLines.size})
            </button>
          )}
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
              <tr className="border-b-2 border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                <th className="px-3 py-2.5 w-[40px]">
                  <input
                    type="checkbox"
                    checked={lines.filter(l => !l.is_reconciled).length > 0 && selectedLines.size === lines.filter(l => !l.is_reconciled).length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 dark:border-[#475569] text-brand-600 focus:ring-brand-500"
                  />
                </th>
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
                  runningBalance += line.credit - line.debit;
                  const displayBalance = line.balance != null ? line.balance : runningBalance;
                  return (
                    <tr key={line.id} className="border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50/50 dark:hover:bg-[#1a1a24]/50 transition-colors">
                      <td className="px-3 py-2.5">
                        {!line.is_reconciled && (
                          <input
                            type="checkbox"
                            checked={selectedLines.has(line.id)}
                            onChange={() => toggleSelectLine(line.id)}
                            className="rounded border-slate-300 dark:border-[#475569] text-brand-600 focus:ring-brand-500"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 dark:text-[#cbd5e1]">{toDisplayDate(line.transaction_date)}</td>
                      <td className="px-3 py-2.5 max-w-[200px] truncate text-slate-900 dark:text-[#f1f5f9] font-medium" title={line.description}>{line.description}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-[#cbd5e1]">{line.reference || "—"}</td>
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

      {/* ── Column Mapping Modal ──────────────────────────────────────────── */}
      {showColumnMapper && csvPreview && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) handleCancelImport(); }}>
          <div className="mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white dark:bg-[#16161f] p-6 shadow-xl dark:shadow-dark-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Map CSV Columns</h3>
              <button onClick={handleCancelImport} className="text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#e2e8f0]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mt-2 text-sm text-slate-600 dark:text-[#cbd5e1]">
              Map each CSV column to the correct field. Required fields are marked with *.
            </p>

            {/* Column mapping dropdowns */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(FIELD_LABELS).map(([field, label]) => {
                const isRequired = REQUIRED_FIELDS.includes(field);
                return (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-[#cbd5e1] mb-1">
                      {label} {isRequired && <span className="text-red-500">*</span>}
                    </label>
                    <Select
                      value={columnMap[field] || ""}
                      onChange={(v) => setColumnMap((prev) => ({ ...prev, [field]: v || null }))}
                      options={[{ value: "", label: "— Skip —" }, ...csvPreview.raw_columns.map((col) => ({ value: col, label: col }))]}
                    />
                  </div>
                );
              })}
            </div>

            {/* Preview table */}
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Preview (first 5 rows)</h4>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1a1a24]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#16161f]/80">
                      {csvPreview.raw_columns.map((col) => (
                        <th key={col} className="px-2 py-1.5 text-left font-semibold text-slate-600 dark:text-[#cbd5e1]">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.preview_rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]">
                        {csvPreview.raw_columns.map((col) => (
                          <td key={col} className="px-2 py-1.5 text-slate-700 dark:text-[#cbd5e1] max-w-[150px] truncate" title={row[col]}>
                            {row[col] || ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={handleCancelImport}
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
              >
                Cancel
              </button>
              <button
                onClick={handleImportWithMapping}
                disabled={importing}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Match Modal ──────────────────────────────────────────────────── */}
      {matchLine && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) { setMatchLine(null); setCandidates([]); } }}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              <p className="mt-4 text-sm text-slate-500 dark:text-[#cbd5e1]">Searching for matches…</p>
            ) : candidates.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-[#cbd5e1]">No matching vouchers found. You may need to create the voucher first.</p>
            ) : (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Matching vouchers (ranked by score):</p>
                {candidates[0]?.score < 50 && (
                  <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      Low confidence match
                    </div>
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      The best match has a score below 50%. This may be incorrect. Verify the party, date, and amount before matching.
                    </p>
                  </div>
                )}
                <div className="mt-2 space-y-2">
                  {candidates.map((c) => (
                    <div
                      key={c.voucher_id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-[#1a1a24] p-3 hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
                    >
                      <div className="text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.voucher_type}</span>{" "}
                          <span className="text-slate-500 dark:text-[#cbd5e1]">#{c.voucher_number}</span>
                          <span className="text-slate-400 dark:text-[#64748b]">({toDisplayDate(c.voucher_date)})</span>
                          <ScoreBadge score={c.score} quality={c.match_quality} />
                        </div>
                        {c.narration && (
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-[#cbd5e1] truncate max-w-xs">{c.narration}</div>
                        )}
                        {/* Score breakdown */}
                        <div className="mt-1 flex gap-3 text-[10px] text-slate-400 dark:text-[#64748b]">
                          <span>Amount: {c.score_breakdown.amount}</span>
                          <span>Date: {c.score_breakdown.date}</span>
                          <span>Description: {c.score_breakdown.description}</span>
                          <span>Ref: {c.score_breakdown.reference}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">₹{fmt(c.amount)}</span>
                        <button
                          onClick={async () => {
                            if (c.score < 50) {
                              if (!await showConfirm(`Low confidence match (${c.score}%). Are you sure this is the correct voucher?`)) {
                                return;
                              }
                            }
                            handleMatch(c.voucher_id);
                          }}
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
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
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
