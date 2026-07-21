import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { toDisplayDate } from "../utils/dateUtils";
import Select from "../components/Select";
import Drawer from "../components/Drawer";
import Tabs from "../components/Tabs";
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
  statement_balance: number;
  book_balance: number;
  difference: number;
  suggested_count: number;
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

interface BatchSuggestResult {
  line_id: string;
  best_candidate: {
    voucher_id: string;
    voucher_number: string;
    voucher_type: string;
    voucher_date: string;
    narration: string | null;
    amount: number;
    score: number;
    match_quality: string;
  } | null;
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

  // Matching state (drawer)
  const [matchLine, setMatchLine] = useState<StatementLine | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  // Filter state
  const [filter, setFilter] = useState<"all" | "suggested" | "unreconciled" | "reconciled">("all");

  // Advanced filter state
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "debit" | "credit">("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // CSV preview & column mapping state
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string | null>>({});
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Auto-reconcile state
  const [autoReconciling, setAutoReconciling] = useState(false);
  const [autoReconcileResult, setAutoReconcileResult] = useState<AutoReconcileResult | null>(null);
  const [minScore, setMinScore] = useState(80);
  const [showAutoMatch, setShowAutoMatch] = useState(false);

  // Bulk selection state
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());

  // Batch suggestions (for suggested column)
  const [batchSuggestions, setBatchSuggestions] = useState<BatchSuggestResult[]>([]);

  // ── Data Loading ────────────────────────────────────────────────────────

  useEffect(() => {
    api.get<Ledger[]>("/coa/ledgers?group_code=GRP_BANK_ACCOUNTS").then((data) => {
      setLedgers(data.filter((l) => l.is_active));
    });
  }, []);

  const loadLines = useCallback(() => {
    if (!selectedLedger) return;
    setLoading(true);
    const params = new URLSearchParams({ ledger_id: selectedLedger });
    if (filter === "reconciled") params.set("reconciled", "true");
    else if (filter === "unreconciled") params.set("reconciled", "false");
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (minAmount) params.set("min_amount", minAmount);
    if (maxAmount) params.set("max_amount", maxAmount);
    if (search) params.set("search", search);

    Promise.all([
      api.get<StatementLine[]>(`/bank-reconciliation/lines?${params}`),
      api.get<Summary>(`/bank-reconciliation/summary?ledger_id=${selectedLedger}`),
      api.get<BatchSuggestResult[]>(`/bank-reconciliation/batch-suggest?ledger_id=${selectedLedger}&limit=200`),
    ])
      .then(([linesData, summaryData, suggestData]) => {
        setLines(linesData);
        setSummary(summaryData);
        setBatchSuggestions(suggestData);
      })
      .catch((err) => toast.error(err?.message || "Failed to load data"))
      .finally(() => setLoading(false));
  }, [selectedLedger, filter, dateFrom, dateTo, typeFilter, minAmount, maxAmount, search]);

  useEffect(() => { loadLines(); }, [loadLines]);

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

  // ── Match Handlers ──────────────────────────────────────────────────────

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

  const handleBulkMarkReconciled = async () => {
    const unreconciledSelected = [...selectedLines].filter(id => {
      const line = lines.find(l => l.id === id);
      return line && !line.is_reconciled;
    });
    if (unreconciledSelected.length === 0) {
      toast.error("No unreconciled lines selected");
      return;
    }
    if (!await showConfirm(`Mark ${unreconciledSelected.length} line(s) as reconciled?`)) return;
    try {
      const result = await api.post<{ processed: number; errors: string[] }>(
        "/bank-reconciliation/lines/bulk-mark-reconciled",
        { ids: unreconciledSelected },
      );
      if (result.errors.length) {
        toast.error(`${result.errors.length} line(s) could not be marked`);
      }
      toast.success(`Marked ${result.processed} line(s) as reconciled`);
      setSelectedLines(new Set());
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to mark lines");
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

  const handleCreateVoucher = async (line: StatementLine) => {
    if (!await showConfirm(`Create a ${line.credit > 0 ? "receipt" : "payment"} voucher for this statement line?`)) return;
    try {
      const result = await api.post<{ voucher_id: string; voucher_number: string }>(
        "/bank-reconciliation/create-voucher",
        {
          statement_line_id: line.id,
          voucher_type: line.credit > 0 ? "receipt" : "payment",
          narration: `Auto-created: ${line.description}`,
        },
      );
      toast.success(`Created ${result.voucher_number} and matched`);
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create voucher");
    }
  };

  const handleIgnore = async (line: StatementLine) => {
    if (!await showConfirm("Mark this line as a bank charge?")) return;
    try {
      const result = await api.post<{ voucher_id: string; voucher_number: string }>(
        "/bank-reconciliation/mark-bank-charge",
        { statement_line_id: line.id },
      );
      toast.success(`Marked as bank charge (${result.voucher_number})`);
      loadLines();
    } catch (err: any) {
      toast.error(err?.message || "Failed to mark as bank charge");
    }
  };

  // ── Auto-Reconcile ────────────────────────────────────────────────────────

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

  // ── Formatting Helpers ──────────────────────────────────────────────────

  const fmt = (n: number) =>
    Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtBalance = (n: number) => {
    if (n < 0) return `₹${fmt(n)} Dr`;
    return `₹${fmt(n)}`;
  };

  const ledgerOptions = [
    { value: "", label: "Select a bank ledger…" },
    ...ledgers.map((l) => ({ value: l.id, label: l.name })),
  ];

  // ── Keyboard Handling ───────────────────────────────────────────────────

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

  // ── Batch suggestion lookup ────────────────────────────────────────────

  const suggestionMap = useMemo(() => {
    const m = new Map<string, BatchSuggestResult>();
    for (const s of batchSuggestions) m.set(s.line_id, s);
    return m;
  }, [batchSuggestions]);

  const suggestedIds = useMemo(() => {
    return new Set(
      batchSuggestions.filter(s => s.best_candidate && s.best_candidate.score >= 50).map(s => s.line_id)
    );
  }, [batchSuggestions]);

  // ── Filtered lines ─────────────────────────────────────────────────────

  const displayLines = useMemo(() => {
    if (filter === "suggested") return lines.filter(l => suggestedIds.has(l.id));
    return lines;
  }, [lines, filter, suggestedIds]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Bank Reconciliation</h1>

      {/* ── Ledger Selector ────────────────────────────────────────────── */}
      <div className="mt-4">
        <Select
          value={selectedLedger}
          onChange={setSelectedLedger}
          options={ledgerOptions}
          label="Bank Account"
          className="w-full max-w-md"
        />
      </div>

      {selectedLedger && (
        <>
          {/* ── Balance Comparison Card ────────────────────────────────── */}
          {summary && (
            <div className="mt-4 rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-5 shadow-sm">
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Statement Balance</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">
                    ₹{fmt(summary.statement_balance)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Book Balance</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">
                    ₹{fmt(summary.book_balance)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">Difference</div>
                  <div className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                    summary.difference === 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}>
                    ₹{fmt(summary.difference)}
                    {summary.difference !== 0 && (
                      <span className="ml-1 text-sm">⚠</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-6 border-t border-slate-100 dark:border-[#282832] pt-3 text-sm">
                <span className="text-slate-500 dark:text-[#94a3b8]">Total Lines: <span className="font-semibold text-slate-700 dark:text-[#f1f5f9]">{summary.total_lines}</span></span>
                <span className="text-slate-500 dark:text-[#94a3b8]">Reconciled: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{summary.reconciled_count}</span></span>
                <span className="text-slate-500 dark:text-[#94a3b8]">Unreconciled: <span className="font-semibold text-amber-600 dark:text-amber-400">{summary.unreconciled_count}</span></span>
                <span className="text-slate-500 dark:text-[#94a3b8]">Suggested: <span className="font-semibold text-blue-600 dark:text-blue-400">{summary.suggested_count}</span></span>
              </div>
            </div>
          )}

          {/* ── Import Section (Conditional) ─────────────────────────────── */}
          <div className="mt-4 flex items-center gap-3">
            {summary && summary.total_lines > 0 ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500 dark:text-[#94a3b8]">
                  Last import: <span className="font-medium text-slate-700 dark:text-[#f1f5f9]">{summary.total_lines} transactions</span>
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="import-new"
                />
                <label
                  htmlFor="import-new"
                  className="cursor-pointer rounded-lg border border-slate-200 dark:border-[#282832] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
                >
                  Import New
                </label>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-[#282832] p-6 text-center w-full">
                <svg className="mx-auto h-8 w-8 text-slate-300 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="mt-2 text-sm text-slate-500 dark:text-[#94a3b8]">Upload a bank statement CSV or Excel file</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="import-first"
                />
                <label
                  htmlFor="import-first"
                  className="mt-2 inline-block cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
                >
                  Choose File
                </label>
                <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">Accepts CSV, TXT, XLSX, or XLS</p>
              </div>
            )}
          </div>

          {/* ── Auto-Match Collapsible Panel ─────────────────────────────── */}
          {summary && summary.unreconciled_count > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowAutoMatch(!showAutoMatch)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-[#f1f5f9] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors w-full"
              >
                <svg className={`h-4 w-4 text-slate-400 dark:text-[#64748b] transition-transform ${showAutoMatch ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                Auto Match
              </button>
              {showAutoMatch && (
                <div className="mt-2 rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1] mb-1">
                        Match Score Threshold
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="50"
                          max="100"
                          value={minScore}
                          onChange={(e) => setMinScore(Number(e.target.value))}
                          className="w-32"
                        />
                        <span className="text-sm font-mono text-slate-700 dark:text-[#f1f5f9]">{minScore}%</span>
                      </div>
                    </div>
                    <button
                      onClick={handleAutoReconcile}
                      disabled={autoReconciling}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {autoReconciling ? "Matching…" : "Run Auto-Match"}
                    </button>
                  </div>

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
                          <p className="text-emerald-700 dark:text-emerald-400">Matched: {matched.length}</p>
                          {belowThreshold.length > 0 && (
                            <p className="text-amber-600 dark:text-amber-400">Below threshold: {belowThreshold.length}</p>
                          )}
                          {noMatch.length > 0 && (
                            <p className="text-red-600 dark:text-red-400">No matching voucher: {noMatch.length}</p>
                          )}
                          {noCandidates.length > 0 && (
                            <p className="text-slate-500 dark:text-[#94a3b8]">Skipped (zero amount): {noCandidates.length}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setAutoReconcileResult(null)}
                          className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          Dismiss
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── Tabs with Counts ────────────────────────────────────────── */}
          <div className="mt-4 flex items-center justify-between gap-4">
            <Tabs
              tabs={[
                { key: "all", label: "All", count: summary?.total_lines },
                { key: "suggested", label: "Suggested", count: summary?.suggested_count },
                { key: "unreconciled", label: "Unreconciled", count: summary?.unreconciled_count },
                { key: "reconciled", label: "Reconciled", count: summary?.reconciled_count },
              ]}
              active={filter}
              onChange={(k) => setFilter(k as typeof filter)}
            />

            {/* ── Bulk Action Bar ──────────────────────────────────────── */}
            {selectedLines.size > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] px-3 py-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Selected: {selectedLines.size}</span>
                <button
                  onClick={handleBulkMarkReconciled}
                  className="rounded px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                >
                  Mark Reconciled
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedLines(new Set())}
                  className="rounded px-2 py-1 text-xs font-medium text-slate-400 dark:text-[#64748b] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* ── Filters ────────────────────────────────────────────────── */}
          {selectedLedger && (
            <div className="mt-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-[#94a3b8] hover:text-slate-700 dark:hover:text-[#cbd5e1] transition-colors"
              >
                <svg className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                Filters
                {(dateFrom || dateTo || typeFilter !== "all" || minAmount || maxAmount || search) && (
                  <span className="rounded-full bg-blue-100 dark:bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                    Active
                  </span>
                )}
              </button>
              {showFilters && (
                <div className="mt-2 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-3 shadow-sm">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] mb-1">Date From</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-2.5 py-1.5 text-xs text-slate-700 dark:text-[#f1f5f9]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] mb-1">Date To</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-2.5 py-1.5 text-xs text-slate-700 dark:text-[#f1f5f9]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] mb-1">Type</label>
                    <div className="flex gap-1">
                      {(["all", "debit", "credit"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTypeFilter(t)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            typeFilter === t
                              ? "bg-brand-50 dark:bg-blue-500/10 text-brand-700 dark:text-blue-400"
                              : "text-slate-500 dark:text-[#64748b] hover:bg-slate-50 dark:hover:bg-[#282832]"
                          }`}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] mb-1">Min Amount</label>
                    <input
                      type="number"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      placeholder="0"
                      className="w-20 rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-2.5 py-1.5 text-xs text-slate-700 dark:text-[#f1f5f9]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] mb-1">Max Amount</label>
                    <input
                      type="number"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      placeholder="∞"
                      className="w-20 rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-2.5 py-1.5 text-xs text-slate-700 dark:text-[#f1f5f9]"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[10px] font-medium text-slate-500 dark:text-[#94a3b8] mb-1">Search</label>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Description or reference…"
                      className="w-full rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-2.5 py-1.5 text-xs text-slate-700 dark:text-[#f1f5f9]"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setDateFrom(""); setDateTo(""); setTypeFilter("all");
                      setMinAmount(""); setMaxAmount(""); setSearch("");
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 dark:text-[#64748b] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Statement Lines Table ───────────────────────────────────── */}
          {loading ? (
            <ListSkeleton title="Bank Reconciliation" cols={4} />
          ) : (
            <div className="mt-4">
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
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
                    <th className="px-3 py-2.5 w-[120px] text-right">Balance</th>
                    <th className="px-3 py-2.5 w-[150px]">Suggested</th>
                    <th className="px-3 py-2.5 w-[90px] text-center">Status</th>
                    <th className="px-3 py-2.5 w-[140px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let runningBalance = 0;
                    return displayLines.map((line) => {
                      runningBalance += line.credit - line.debit;
                      const displayBalance = line.balance != null ? line.balance : runningBalance;
                      const suggestion = suggestionMap.get(line.id);
                      const bestCandidate = suggestion?.best_candidate;

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
                            {fmtBalance(displayBalance)}
                          </td>
                          <td className="px-3 py-2.5">
                            {bestCandidate && !line.is_reconciled ? (
                              <button
                                onClick={() => handleSuggest(line)}
                                className="group flex items-center gap-1.5 rounded-lg border border-slate-100 dark:border-[#282832] bg-slate-50 dark:bg-[#1a1a24] px-2 py-1 hover:border-blue-200 dark:hover:border-blue-500/30 transition-colors"
                              >
                                <span className="text-xs font-medium text-slate-700 dark:text-[#f1f5f9]">
                                  {bestCandidate.voucher_type} #{bestCandidate.voucher_number}
                                </span>
                                <ScoreBadge score={bestCandidate.score} quality={bestCandidate.match_quality} />
                              </button>
                            ) : line.is_reconciled && line.voucher_id ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                Matched
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-[#64748b]">—</span>
                            )}
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
                            <div className="flex items-center justify-end gap-1">
                              {!line.is_reconciled && (
                                <>
                                  <button
                                    onClick={() => handleSuggest(line)}
                                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-600 dark:text-blue-400 hover:bg-brand-50 dark:hover:bg-blue-500/10 transition-colors"
                                  >
                                    Find Match
                                  </button>
                                  <button
                                    onClick={() => handleCreateVoucher(line)}
                                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                                  >
                                    Create Voucher
                                  </button>
                                  <button
                                    onClick={() => handleIgnore(line)}
                                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-400 dark:text-[#64748b] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
                                  >
                                    Ignore
                                  </button>
                                </>
                              )}
                              {line.is_reconciled && (
                                <button
                                  onClick={() => handleUnmatch(line.id)}
                                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                                >
                                  Unmatch
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                  {displayLines.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400 dark:text-[#64748b]">
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
          )}
        </>
      )}

      {!selectedLedger && (
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

            <div className="mt-6">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Preview (first 5 rows)</h4>
              <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
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

      {/* ── Match Drawer ──────────────────────────────────────────────────── */}
      <Drawer
        open={!!matchLine}
        onClose={() => { setMatchLine(null); setCandidates([]); }}
        title="Match Transaction"
        width="w-[520px]"
      >
        {matchLine && (
          <>
            <div className="rounded-lg bg-slate-50 dark:bg-[#282832] p-4 text-sm">
              <div className="grid grid-cols-1 gap-2">
                <div><span className="font-medium text-slate-500 dark:text-[#94a3b8]">Date:</span> <span className="text-slate-900 dark:text-[#f1f5f9]">{toDisplayDate(matchLine.transaction_date)}</span></div>
                <div><span className="font-medium text-slate-500 dark:text-[#94a3b8]">Description:</span> <span className="text-slate-900 dark:text-[#f1f5f9]">{matchLine.description}</span></div>
                <div>
                  <span className="font-medium text-slate-500 dark:text-[#94a3b8]">Amount:</span>{" "}
                  <span className="font-mono font-semibold text-slate-900 dark:text-[#f1f5f9]">
                    {matchLine.credit > 0 ? `₹${fmt(matchLine.credit)} (Credit)` : `₹${fmt(matchLine.debit)} (Debit)`}
                  </span>
                </div>
                {matchLine.reference && (
                  <div><span className="font-medium text-slate-500 dark:text-[#94a3b8]">Reference:</span> <span className="text-slate-900 dark:text-[#f1f5f9]">{matchLine.reference}</span></div>
                )}
              </div>
            </div>

            {suggestionLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-[#cbd5e1]">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Searching for matches…
              </div>
            ) : candidates.length === 0 ? (
              <div className="mt-4">
                <p className="text-sm text-slate-500 dark:text-[#cbd5e1]">No matching vouchers found.</p>
                <button
                  onClick={async () => {
                    if (!matchLine) return;
                    setMatchLine(null);
                    setCandidates([]);
                    await handleCreateVoucher(matchLine);
                  }}
                  className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                >
                  Create Voucher
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Suggested matches:</p>
                {candidates[0]?.score < 50 && (
                  <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      Low confidence match
                    </div>
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      Best match is below 50%. Verify the party, date, and amount before matching.
                    </p>
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {candidates.map((c) => (
                    <div
                      key={c.voucher_id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-[#1a1a24] p-3 hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors"
                    >
                      <div className="text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{c.voucher_type}</span>{" "}
                          <span className="text-slate-500 dark:text-[#cbd5e1]">#{c.voucher_number}</span>
                          <span className="text-slate-400 dark:text-[#64748b]">({toDisplayDate(c.voucher_date)})</span>
                          <ScoreBadge score={c.score} quality={c.match_quality} />
                        </div>
                        {c.narration && (
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-[#cbd5e1] truncate max-w-xs">{c.narration}</div>
                        )}
                        <div className="mt-1 flex gap-3 text-[10px] text-slate-400 dark:text-[#64748b]">
                          <span>Amount: {c.score_breakdown.amount}</span>
                          <span>Date: {c.score_breakdown.date}</span>
                          <span>Description: {c.score_breakdown.description}</span>
                          <span>Ref: {c.score_breakdown.reference}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-slate-700 dark:text-[#f1f5f9]">₹{fmt(c.amount)}</span>
                        <button
                          onClick={async () => {
                            if (c.score < 50) {
                              if (!await showConfirm(`Low confidence match (${c.score}%). Are you sure?`)) {
                                return;
                              }
                            }
                            handleMatch(c.voucher_id);
                          }}
                          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={async () => {
                  if (!matchLine) return;
                  const line = matchLine;
                  setMatchLine(null);
                  setCandidates([]);
                  await handleIgnore(line);
                }}
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
              >
                Mark as Bank Charge
              </button>
              <button
                onClick={() => { setMatchLine(null); setCandidates([]); }}
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
