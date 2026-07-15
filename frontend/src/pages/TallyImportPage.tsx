import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import PageHeader from "../components/PageHeader";

// ── Tally Import Types ────────────────────────────────────────────────────

interface ValidationIssue { entity: string; item: string; reason: string; }
interface ValidationResult { errors: ValidationIssue[]; warnings: ValidationIssue[]; }
interface SummaryItem { name?: string; voucher_number?: string; voucher_type?: string; date?: string; group?: string; parent?: string; type?: string; qty?: number; }
interface CreatedDetailItem { id?: string; name?: string; voucher_number?: string; voucher_type?: string; voucher_date?: string; date?: string; narration?: string; group?: string; opening_balance?: number; opening_qty?: number; type?: string; total?: number; }
interface ImportJob { id: string; import_type: string; filename: string | null; status: string; summary: Record<string, SummaryItem[]> | null; created_counts: Record<string, number> | null; created_at: string | null; }
interface ImportJobDetail extends ImportJob { company_id: string; user_id: string; errors: Record<string, unknown> | null; created_details: Record<string, CreatedDetailItem[]> | null; total_value: number | null; logs: LogEntry[] | null; updated_at: string | null; }
interface UploadResponse { job_id: string; summary: Record<string, SummaryItem[]>; validation: ValidationResult | null; }
interface SkipWarning { entity: string; item: string; reason: string; }
interface LogEntry { ts: string; step: string; message: string; status: string; entity?: string; item?: string; }

// ── Data Import Types ─────────────────────────────────────────────────────

type EntityType = "ledgers" | "parties" | "stock_items";
interface PreviewResponse { entity_type: string; raw_columns: string[]; detected_mapping: Record<string, string | null>; preview_rows: Record<string, string>[]; total_rows: number; }
interface ImportResult { imported: number; skipped: number; errors: string[]; }

// ── Constants ─────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = { groups: "Groups", ledgers: "Ledgers", parties: "Parties", stock_groups: "Stock Groups", stock_items: "Stock Items", units: "Units", vouchers: "Vouchers" };

const DATA_ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "ledgers", label: "Ledgers" },
  { value: "parties", label: "Parties (Customers/Suppliers)" },
  { value: "stock_items", label: "Stock Items" },
];

// ── Tally Import Helpers ──────────────────────────────────────────────────

function DetailSection({ title, items, renderItem }: { title: string; items: any[]; renderItem: (item: any, i: number) => string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="border-t border-slate-200 dark:border-[#282832] pt-3 first:border-t-0 first:pt-0">
      <h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] mb-1.5 text-sm">{title} <span className="text-slate-400 dark:text-[#64748b] font-normal">({items.length})</span></h4>
      <div className="max-h-48 overflow-y-auto space-y-0.5">{items.map((item, i) => <div key={i} className="text-xs text-slate-600 dark:text-[#cbd5e1] font-mono truncate">{renderItem(item, i)}</div>)}</div>
    </div>
  );
}

function SummarySection({ title, items }: { title: string; items: SummaryItem[] }) {
  return <DetailSection title={title} items={items} renderItem={(item: SummaryItem) => {
    if (item.voucher_number) return `#${item.voucher_number} — ${item.voucher_type} (${item.date})`;
    if (item.name && item.group) return `${item.name} → ${item.group}`;
    if (item.name && item.parent) return `${item.name} under ${item.parent}`;
    if (item.name && item.type) return `${item.name} (${item.type})`;
    return item.name || item.voucher_number || "";
  }} />;
}

function CreatedSection({ title, items }: { title: string; items: CreatedDetailItem[] }) {
  return <DetailSection title={title} items={items} renderItem={(item: CreatedDetailItem) => {
    if (item.voucher_number) { const totalStr = item.total ? ` ₹${item.total.toLocaleString("en-IN")}` : ""; return `#${item.voucher_number} — ${item.voucher_type} (${item.voucher_date})${totalStr}`; }
    if (item.name && item.opening_balance !== undefined) return `${item.name} → ${item.group} (₹${item.opening_balance.toLocaleString("en-IN")})`;
    if (item.name && item.opening_qty !== undefined) return `${item.name} → ${item.group} (qty: ${item.opening_qty})`;
    if (item.name && item.type) return `${item.name} (${item.type})`;
    return item.name || item.voucher_number || "";
  }} />;
}

function ValidationDisplay({ validation }: { validation: ValidationResult }) {
  if (validation.errors.length === 0 && validation.warnings.length === 0) return null;
  return (
    <div className="border-t border-slate-200 dark:border-[#282832] pt-3">
      <h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] mb-2 text-sm">Validation</h4>
      {validation.errors.length > 0 && <div className="mb-2"><h5 className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Errors ({validation.errors.length})</h5><div className="max-h-32 overflow-y-auto space-y-0.5">{validation.errors.map((v, i) => <div key={i} className="text-xs text-red-500 dark:text-red-300 font-mono truncate">{v.entity}: {v.item} — {v.reason}</div>)}</div></div>}
      {validation.warnings.length > 0 && <div><h5 className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Warnings ({validation.warnings.length})</h5><div className="max-h-32 overflow-y-auto space-y-0.5">{validation.warnings.map((v, i) => <div key={i} className="text-xs text-amber-500 dark:text-amber-300 font-mono truncate">{v.entity}: {v.item} — {v.reason}</div>)}</div></div>}
    </div>
  );
}

function SkipWarnings({ skipWarnings }: { skipWarnings: SkipWarning[] }) {
  if (!skipWarnings || skipWarnings.length === 0) return null;
  const byEntity: Record<string, SkipWarning[]> = {};
  for (const sw of skipWarnings) { (byEntity[sw.entity] ??= []).push(sw); }
  return (
    <div className="border-t border-slate-200 dark:border-[#282832] pt-3">
      <h4 className="font-medium text-amber-700 dark:text-amber-400 mb-2 text-sm">Skipped Items ({skipWarnings.length})</h4>
      {Object.entries(byEntity).map(([entity, items]) => (<div key={entity} className="mb-2"><h5 className="text-xs font-medium text-slate-600 dark:text-[#cbd5e1] mb-1">{ENTITY_LABELS[entity] || entity} ({items.length})</h5><div className="max-h-32 overflow-y-auto space-y-0.5">{items.map((sw, i) => <div key={i} className="text-xs text-amber-500 dark:text-amber-300 font-mono truncate">{sw.item} — {sw.reason}</div>)}</div></div>))}
    </div>
  );
}

const LOG_STATUS_COLORS: Record<string, string> = { info: "text-slate-600 dark:text-[#cbd5e1]", created: "text-green-600 dark:text-green-400", skip: "text-amber-600 dark:text-amber-400", warning: "text-amber-600 dark:text-amber-400", error: "text-red-600 dark:text-red-400" };

function DetailedLogs({ logs }: { logs: LogEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  if (!logs || logs.length === 0) return null;
  const filtered = filter === "all" ? logs : logs.filter((l) => l.status === filter);
  const statusCounts = logs.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  return (
    <div className="border-t border-slate-200 dark:border-[#282832] pt-3">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left mb-2">
        <span className="text-slate-400 dark:text-[#64748b] text-xs">{expanded ? "▼" : "▶"}</span>
        <h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] text-sm">Detailed Import Logs ({logs.length} entries)</h4>
      </button>
      {expanded && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">{["all", "created", "skip", "info", "error"].map((s) => <button key={s} onClick={() => setFilter(s)} className={`px-2 py-0.5 text-xs rounded-full font-medium transition-colors ${filter === s ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-[#cbd5e1] hover:bg-slate-200 dark:hover:bg-slate-700"}`}>{s === "all" ? `All (${logs.length})` : `${s} (${statusCounts[s] || 0})`}</button>)}</div>
          <div className="max-h-64 overflow-y-auto space-y-0.5 bg-slate-50 dark:bg-[#0f0f17] rounded-lg p-2">
            {filtered.map((entry, i) => (<div key={i} className="flex items-start gap-2 text-xs font-mono"><span className="text-slate-400 dark:text-[#64748b] shrink-0 w-20">{new Date(entry.ts).toLocaleTimeString()}</span><span className={`shrink-0 w-16 font-medium ${LOG_STATUS_COLORS[entry.status] || LOG_STATUS_COLORS.info}`}>{entry.status}</span><span className="text-slate-600 dark:text-[#cbd5e1]">{entry.message}</span></div>))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function TallyImportPage() {
  const toast = useToastStore();
  const [activeTab, setActiveTab] = useState<"tally" | "csv">("tally");

  // ── Tally Import State ────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ImportJobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [importMode, setImportMode] = useState<"current" | "new">("current");
  const [newCompanyName, setNewCompanyName] = useState("");

  const refresh = () => { setLoading(true); api.get<ImportJob[]>("/tally-import/jobs").then(setJobs).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (!selectedJob) return; function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setSelectedJob(null); } document.addEventListener("keydown", handleKey); return () => document.removeEventListener("keydown", handleKey); }, [selectedJob]);

  const handleTallyUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLastValidation(null);
    setBusyId("upload");
    const isZip = file.name.toLowerCase().endsWith(".zip");
    if (isZip && importMode === "new" && !newCompanyName.trim()) {
      toast.error("Enter a name for the new company");
      setBusyId(null);
      return;
    }
    try {
      const formData = new FormData();
      formData.append("file", file);
      const url = isZip ? "/tally-import/upload-archive" : "/tally-import/upload";
      const res = await api.post<UploadResponse>(url, formData);
      const total = Object.values(res.summary).reduce((s: number, arr: any) => s + (arr?.length || 0), 0);
      toast.success(`Uploaded "${file.name}" — ${total} items found`);
      if (res.validation) setLastValidation(res.validation);
      fileRef.current.value = "";
      setHasFile(false);
      refresh();
    } catch (err: any) { toast.error(err?.detail?.detail || err?.message || "Upload failed"); }
    finally { setBusyId(null); }
  };

  const handleConfirm = async (jobId: string) => { setBusyId(jobId); try { let url = `/tally-import/jobs/${jobId}/confirm`; if (importMode === "new" && newCompanyName.trim()) url += `?new_company_name=${encodeURIComponent(newCompanyName.trim())}`; const res = await api.post<ImportJobDetail>(url, { job_id: jobId }); const total = Object.values(res.created_details ?? {}).reduce((s: number, arr: any) => s + (arr?.length || 0), 0); toast.success(`Import completed: ${total} records created` + (importMode === "new" ? ` into "${newCompanyName.trim()}"` : "")); refresh(); setSelectedJob(res); } catch (err: any) { toast.error(err?.detail?.detail || err?.message || "Import failed"); } finally { setBusyId(null); } };
  const handleUndo = async (jobId: string) => { const ok = await showConfirm("This will delete all records created by this import.\n\nRecords that are referenced by other data will be skipped.\nContinue?", { danger: true, confirmLabel: "Delete" }); if (!ok) return; setBusyId(jobId); try { const res = await api.post<ImportJobDetail>(`/tally-import/jobs/${jobId}/undo`, {}); toast.success(`Import undone successfully`); refresh(); setSelectedJob(res); } catch (err: any) { toast.error(err?.detail?.detail || err?.message || "Undo failed"); } finally { setBusyId(null); } };
  const viewJob = async (jobId: string) => { try { const res = await api.get<ImportJobDetail>(`/tally-import/jobs/${jobId}`); setSelectedJob(res); } catch { toast.error("Failed to load job details"); } };

  const statusBadge = (status: string) => { const colors: Record<string, string> = { parsed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", pending: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300", importing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", undone: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" }; return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] ?? colors.pending}`}>{status}</span>; };

  const renderPreviewSections = (summary: Record<string, SummaryItem[]>) => { const entries = Object.entries(summary).filter(([, items]) => items.length > 0); if (entries.length === 0) return null; return <div className="border-t border-slate-200 dark:border-[#282832] pt-3"><h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] mb-2 text-sm">Preview</h4>{entries.map(([key, items]) => <SummarySection key={key} title={ENTITY_LABELS[key] || key} items={items} />)}</div>; };
  const renderCreatedSections = (details: Record<string, CreatedDetailItem[]>) => { const entries = Object.entries(details).filter(([, items]) => items.length > 0); if (entries.length === 0) return null; return <div className="border-t border-slate-200 dark:border-[#282832] pt-3"><h4 className="font-medium text-green-700 dark:text-green-400 mb-2 text-sm">Created Records</h4>{entries.map(([key, items]) => <CreatedSection key={key} title={ENTITY_LABELS[key] || key} items={items} />)}</div>; };
  const renderRemovedSections = (items: Record<string, any[]>, label: string) => { const entries = Object.entries(items).filter(([, arr]) => arr.length > 0); if (entries.length === 0) return null; return <div className="space-y-2"><h4 className="font-medium text-sm">{label}</h4>{entries.map(([key, arr]) => <CreatedSection key={key} title={ENTITY_LABELS[key] || key} items={arr} />)}</div>; };
  const renderSkippedSections = (items: Record<string, any[]>) => { const entries = Object.entries(items).filter(([, arr]) => arr.length > 0); if (entries.length === 0) return null; return <div className="space-y-2"><h4 className="font-medium text-amber-700 dark:text-amber-400 text-sm">Skipped — in use elsewhere</h4>{entries.map(([key, arr]) => <DetailSection key={key} title={ENTITY_LABELS[key] || key} items={arr} renderItem={(item: any) => item.name || item.voucher_number || ""} />)}</div>; };
  const renderUndoResult = (errors: any, createdDetails: Record<string, CreatedDetailItem[]> | null) => { if (!errors || !errors.removed) return null; const removed = errors.removed as Record<string, any[]>; const skipped = errors.skipped as Record<string, any[]>; const totalRemoved = Object.values(removed).reduce((s: number, arr: any) => s + (arr?.length || 0), 0); return <>{createdDetails && renderCreatedSections(createdDetails)}<div className="border-t border-slate-200 dark:border-[#282832] pt-3 space-y-3"><h4 className="font-medium text-sm">Undo Result</h4>{totalRemoved > 0 && renderRemovedSections(removed, `Removed (${totalRemoved})`)}{Object.values(skipped).some((arr: any[]) => arr.length > 0) && renderSkippedSections(skipped)}{totalRemoved === 0 && !Object.values(skipped).some((arr: any[]) => arr.length > 0) && <div className="text-xs text-slate-500 dark:text-[#64748b]">Nothing was removed or skipped.</div>}</div></>; };

  const renderModalContent = (job: ImportJobDetail) => {
    const content: JSX.Element[] = [];
    if (job.summary && job.status !== "failed") content.push(renderPreviewSections(job.summary)!);
    if (job.errors && typeof job.errors === "object" && "skip_warnings" in job.errors) { const sw = (job.errors as Record<string, unknown>).skip_warnings as SkipWarning[] | undefined; if (sw && sw.length > 0) content.push(<SkipWarnings key="sw" skipWarnings={sw} />); }
    if (job.created_details && job.status === "completed") content.push(renderCreatedSections(job.created_details)!);
    if (job.status === "undone") content.push(renderUndoResult(job.errors, job.created_details)!);
    if (job.errors && job.status === "failed") content.push(<div key="err" className="border-t border-slate-200 dark:border-[#282832] pt-3"><h4 className="font-medium text-red-700 dark:text-red-400 mb-1">Errors</h4><pre className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg overflow-auto max-h-32">{JSON.stringify(job.errors, null, 2)}</pre></div>);
    if (job.logs && job.logs.length > 0) content.push(<DetailedLogs key="logs" logs={job.logs} />);
    return content.length > 0 ? <div className="space-y-3 text-sm">{content}</div> : null;
  };

  // ── CSV/Excel Import State ────────────────────────────────────────────
  const [csvEntityType, setCsvEntityType] = useState<EntityType | "">("");
  const [csvPreview, setCsvPreview] = useState<PreviewResponse | null>(null);
  const [csvResult, setCsvResult] = useState<ImportResult | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [colMap, setColMap] = useState<Record<string, string | null>>({});
  const [csvTab, setCsvTab] = useState<"upload" | "mapping" | "done">("upload");
  const csvFileRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = useCallback(async () => {
    if (!csvFile || !csvEntityType) return;
    setCsvLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const data = await api.post<PreviewResponse>(`/data-import/preview?entity_type=${csvEntityType}`, formData);
      setCsvPreview(data);
      setColMap(data.detected_mapping);
      setCsvTab("mapping");
    } catch (e: any) { toast.error(e?.message || "Failed to preview file"); }
    finally { setCsvLoading(false); }
  }, [csvFile, csvEntityType]);

  const handleCsvImport = useCallback(async () => {
    if (!csvFile || !csvEntityType) return;
    setCsvLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const params = new URLSearchParams({ entity_type: csvEntityType, skip_duplicates: String(skipDuplicates) });
      if (Object.keys(colMap).length > 0) params.set("column_map", JSON.stringify(colMap));
      const data = await api.post<ImportResult>(`/data-import/import?${params}`, formData);
      setCsvResult(data);
      setCsvTab("done");
    } catch (e: any) { toast.error(e?.message || "Failed to import data"); }
    finally { setCsvLoading(false); }
  }, [csvFile, csvEntityType, skipDuplicates, colMap]);

  const resetCsv = () => { setCsvEntityType(""); setCsvPreview(null); setCsvResult(null); setCsvFile(null); setCsvTab("upload"); setColMap({}); if (csvFileRef.current) csvFileRef.current.value = ""; };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title="Import & Export" subtitle="Import data from Tally, CSV, or Excel files" />

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 rounded-xl bg-slate-100 dark:bg-[#16161f] p-1 w-fit">
        <button onClick={() => setActiveTab("tally")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "tally" ? "bg-white dark:bg-[#282832] text-slate-800 dark:text-[#f1f5f9] shadow-sm" : "text-slate-500 dark:text-[#64748b] hover:text-slate-700 dark:hover:text-[#cbd5e1]"}`}>Tally Import</button>
        <button onClick={() => setActiveTab("csv")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "csv" ? "bg-white dark:bg-[#282832] text-slate-800 dark:text-[#f1f5f9] shadow-sm" : "text-slate-500 dark:text-[#64748b] hover:text-slate-700 dark:hover:text-[#cbd5e1]"}`}>CSV / Excel Import</button>
      </div>

      {/* ═══ Tally Import Tab ═══ */}
      {activeTab === "tally" && (
        <>
          <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6 mb-8">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9] mb-4">Upload File</h2>
            <div className="flex items-center gap-4">
              <input ref={fileRef} type="file" accept=".xml,.txt,.xlsx,.zip" onChange={() => setHasFile(!!fileRef.current?.files?.[0])} className="block w-full text-sm text-slate-500 dark:text-[#64748b] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50" />
              <button onClick={handleTallyUpload} disabled={busyId === "upload" || !hasFile} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">{busyId === "upload" ? "Uploading..." : "Upload & Preview"}</button>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-[#64748b]">Upload a Tally XML / Excel file, or a <span className="font-medium">ZIP</span> containing Tally exports or a raw Tally company folder (e.g. <code>10000/Manager.1800</code>).</p>

            <div className="mt-5 border-t border-slate-200 dark:border-[#282832] pt-4">
              <span className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Import as:</span>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#cbd5e1]">
                  <input type="radio" name="importMode" checked={importMode === "current"} onChange={() => setImportMode("current")} className="accent-blue-600" />
                  Into current company
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#cbd5e1]">
                  <input type="radio" name="importMode" checked={importMode === "new"} onChange={() => setImportMode("new")} className="accent-blue-600" />
                  New company
                </label>
                {importMode === "new" && (
                  <input
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="New company name"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-700 dark:text-[#e2e8f0]"
                  />
                )}
              </div>
              {importMode === "new" && (
                <p className="mt-2 text-xs text-slate-500 dark:text-[#64748b]">A brand-new company (with its own chart of accounts &amp; financial year) will be created and populated. Binary Tally folders import account groups only — use Tally's XML export for full ledgers/vouchers.</p>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="text-slate-500 dark:text-[#64748b]">Don't have a file? Download a sample:</span>
              <a href="/api/tally-import/sample?format=xml" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2">Sample XML</a>
              <span className="text-slate-300 dark:text-[#475569]">|</span>
              <a href="/api/tally-import/sample?format=xlsx" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2">Sample Excel</a>
            </div>
            {lastValidation && <ValidationDisplay validation={lastValidation} />}
          </div>

          <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-[#282832]"><h2 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9]">Import History</h2></div>
            {loading ? <ListSkeleton title="Imports" cols={4} /> : jobs.length === 0 ? <div className="p-6 text-center text-slate-500 dark:text-[#64748b]">No imports yet. Upload a Tally XML file above.</div> : (
              <div className="divide-y divide-slate-200 dark:divide-[#282832]">
                {jobs.map((job) => (<div key={job.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1a1a24] cursor-pointer" onClick={() => viewJob(job.id)}>
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-3"><span className="text-sm font-medium text-slate-800 dark:text-[#f1f5f9] truncate">{job.filename || "Unknown file"}</span>{statusBadge(job.status)}</div>
                    {job.created_counts && (job.status === "undone" ? <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">Was: {Object.entries(job.created_counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(" | ")}</div> : <div className="mt-1 text-xs text-green-600 dark:text-green-400">Created: {Object.entries(job.created_counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(" | ")}</div>)}
                  </div>
                  <div className="ml-4 text-xs text-slate-400 dark:text-[#64748b]">{job.created_at ? new Date(job.created_at).toLocaleDateString() : ""}</div>
                </div>))}
              </div>
            )}
          </div>

          {selectedJob && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={() => setSelectedJob(null)}>
              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6 max-w-xl w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9] mb-4">{selectedJob.filename || "Import Job"}</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-[#64748b]">Status</span>{statusBadge(selectedJob.status)}</div>
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-[#64748b]">Type</span><span className="text-slate-800 dark:text-[#f1f5f9] capitalize">{selectedJob.import_type}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-[#64748b]">File</span><span className="text-slate-800 dark:text-[#f1f5f9]">{selectedJob.filename || "—"}</span></div>
                  {selectedJob.created_at && <div className="flex justify-between"><span className="text-slate-500 dark:text-[#64748b]">Imported at</span><span className="text-slate-800 dark:text-[#f1f5f9]">{new Date(selectedJob.created_at).toLocaleString()}</span></div>}
                  {renderModalContent(selectedJob)}
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setSelectedJob(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-[#cbd5e1] hover:text-slate-800 dark:hover:text-white">Close</button>
                  {selectedJob.status === "parsed" && <button onClick={() => handleConfirm(selectedJob.id)} disabled={busyId === selectedJob.id} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">{busyId === selectedJob.id ? "Importing..." : "Confirm Import"}</button>}
                  {selectedJob.status === "completed" && <button onClick={() => handleUndo(selectedJob.id)} disabled={busyId === selectedJob.id} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">{busyId === selectedJob.id ? "Undoing..." : "Undo Import"}</button>}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ CSV / Excel Import Tab ═══ */}
      {activeTab === "csv" && (
        <>
          {/* Entity Type Selection */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-6">
            {DATA_ENTITY_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => { resetCsv(); setCsvEntityType(opt.value); }} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${csvEntityType === opt.value ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/50" : "border-slate-200 dark:border-[#282832] hover:border-slate-300 dark:hover:border-[#3a3a45]"}`}>
                <span className="text-sm font-medium text-slate-700 dark:text-[#e2e8f0]">{opt.label}</span>
              </button>
            ))}
          </div>

          {csvEntityType && (
            <>
              {/* Step Indicator */}
              <div className="flex items-center gap-4 text-xs font-medium mb-6">
                {(["Upload", "Map Columns", "Done"] as const).map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${(csvTab === "upload" && i === 0) || (csvTab === "mapping" && i === 1) || (csvTab === "done" && i === 2) ? "bg-blue-500 text-white" : "bg-slate-200 dark:bg-[#282832] text-slate-500 dark:text-[#64748b]"}`}>{i + 1}</span>
                    <span className="text-slate-600 dark:text-[#cbd5e1]">{step}</span>
                  </div>
                ))}
              </div>

              {csvTab === "upload" && (
                <div className="rounded-xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-6">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] mb-4">Select File</h3>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">File (CSV or Excel)</label>
                      <input ref={csvFileRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 dark:text-[#cbd5e1] file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-600 hover:file:bg-blue-100 dark:file:bg-blue-500/10 dark:file:text-blue-400" />
                    </div>
                    <button onClick={handleCsvUpload} disabled={!csvFile || csvLoading} className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{csvLoading ? "Uploading..." : "Upload & Preview"}</button>
                  </div>
                  <div className="mt-4 rounded-lg bg-slate-50 dark:bg-[#0f0f16] p-4 text-xs text-slate-500 dark:text-[#64748b]">
                    <p className="font-semibold mb-1">Expected columns:</p>
                    {csvEntityType === "ledgers" && <p>Name, Group (under), Opening Balance, Opening Balance Type (Dr/Cr), GSTIN, Alias</p>}
                    {csvEntityType === "parties" && <p>Name, Party Type (customer/supplier), GSTIN, State Code, PAN, Address, Contact Person, Phone, Email</p>}
                    {csvEntityType === "stock_items" && <p>Name, SKU, HSN/SAC Code, Unit of Measure, Opening Qty, Opening Rate, GST Rate, Reorder Level, Stock Group</p>}
                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-semibold">Download sample:</span>
                      <a href={`/api/data-import/sample?entity_type=${csvEntityType}&format=csv`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2">Sample CSV</a>
                      <span className="text-slate-300 dark:text-[#475569]">|</span>
                      <a href={`/api/data-import/sample?entity_type=${csvEntityType}&format=xlsx`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2">Sample Excel</a>
                    </div>
                  </div>
                </div>
              )}

              {csvTab === "mapping" && csvPreview && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">Column Mapping</h3>
                      <span className="text-xs text-slate-400 dark:text-[#64748b]">{csvPreview.total_rows} rows detected</span>
                    </div>
                    <div className="space-y-3">
                      {Object.entries(csvPreview.detected_mapping).map(([field]) => (
                        <div key={field} className="flex items-center gap-3">
                          <label className="w-40 shrink-0 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] capitalize">{field.replace(/_/g, " ")}</label>
                          <select value={colMap[field] || ""} onChange={(e) => setColMap((prev) => ({ ...prev, [field]: e.target.value || null }))} className="flex-1 rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-xs text-slate-700 dark:text-[#e2e8f0]">
                            <option value="">-- Skip --</option>
                            {csvPreview.raw_columns.map((col) => <option key={col} value={col}>{col}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <label className="mt-4 flex items-center gap-2 text-xs text-slate-600 dark:text-[#cbd5e1]">
                      <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="rounded" /> Skip duplicates (by name)
                    </label>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-6">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] mb-3">Preview (first 5 rows)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-200 dark:border-[#282832]">{Object.values(colMap).filter(Boolean).map((col) => <th key={col} className="px-3 py-2 text-left font-medium text-slate-500 dark:text-[#64748b]">{col}</th>)}</tr></thead>
                        <tbody>{csvPreview.preview_rows.map((row, i) => <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]">{Object.values(colMap).filter(Boolean).map((col) => <td key={col} className="px-3 py-2 text-slate-700 dark:text-[#e2e8f0]">{row[col as string] || ""}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={resetCsv} className="rounded-lg border border-slate-200 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Back</button>
                    <button onClick={handleCsvImport} disabled={csvLoading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{csvLoading ? "Importing..." : `Import ${csvPreview.total_rows} Rows`}</button>
                  </div>
                </div>
              )}

              {csvTab === "done" && csvResult && (
                <div className="rounded-xl border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-6">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] mb-4">Import Complete</h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-lg bg-green-50 dark:bg-green-500/10 p-4"><p className="text-2xl font-bold text-green-600 dark:text-green-400">{csvResult.imported}</p><p className="text-xs text-green-600/70 dark:text-green-400/70">Imported</p></div>
                    <div className="rounded-lg bg-yellow-50 dark:bg-yellow-500/10 p-4"><p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{csvResult.skipped}</p><p className="text-xs text-yellow-600/70 dark:text-yellow-400/70">Skipped</p></div>
                    <div className="rounded-lg bg-red-50 dark:bg-red-500/10 p-4"><p className="text-2xl font-bold text-red-600 dark:text-red-400">{csvResult.errors.length}</p><p className="text-xs text-red-600/70 dark:text-red-400/70">Errors</p></div>
                  </div>
                  {csvResult.errors.length > 0 && <div className="mt-4 max-h-48 overflow-y-auto rounded-lg bg-red-50 dark:bg-red-500/10 p-4">{csvResult.errors.map((err, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{err}</p>)}</div>}
                  <button onClick={resetCsv} className="mt-4 rounded-lg border border-slate-200 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Import More</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
