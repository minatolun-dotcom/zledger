import { useCallback, useEffect, useRef, useState, DragEvent } from "react";
import { api, getToken, getCompanyId } from "../api/client";
import { useToastStore } from "../store/toast";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import Select from "../components/Select";
import Tabs from "../components/Tabs";

// ── Types ──────────────────────────────────────────────────────────────────

interface ValidationIssue { entity: string; item: string; reason: string; }
interface ValidationResult { errors: ValidationIssue[]; warnings: ValidationIssue[]; }
interface SummaryItem { name?: string; voucher_number?: string; voucher_type?: string; date?: string; group?: string; parent?: string; type?: string; qty?: number; }
interface CreatedDetailItem { id?: string; name?: string; voucher_number?: string; voucher_type?: string; voucher_date?: string; date?: string; narration?: string; group?: string; opening_balance?: number; opening_qty?: number; type?: string; total?: number; }
interface ImportJob { id: string; import_type: string; filename: string | null; status: string; summary: Record<string, SummaryItem[]> | null; created_counts: Record<string, number> | null; created_at: string | null; }
interface ImportJobDetail extends ImportJob { company_id: string; user_id: string; errors: Record<string, unknown> | null; created_details: Record<string, CreatedDetailItem[]> | null; total_value: number | null; logs: LogEntry[] | null; updated_at: string | null; }
interface UploadResponse { job_id: string; summary: Record<string, SummaryItem[]>; validation: ValidationResult | null; }
interface LogEntry { ts: string; step: string; message: string; status: string; entity?: string; item?: string; }

type EntityType = "ledgers" | "parties" | "stock_items";
type ImportSource = "tally" | "csv";
type ImportStep = "source" | "upload" | "validate" | "preview" | "import" | "done";
type ExportFormat = "csv" | "xlsx";

interface PreviewResponse { entity_type: string; raw_columns: string[]; detected_mapping: Record<string, string | null>; preview_rows: Record<string, string>[]; total_rows: number; }
interface ImportResult { job_id?: string; imported: number; skipped: number; errors: string[]; }

// ── Constants ──────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = { groups: "Groups", ledgers: "Ledgers", parties: "Parties", stock_groups: "Stock Groups", stock_items: "Stock Items", units: "Units", vouchers: "Vouchers" };

const MASTERS_ENTITIES: { value: EntityType; label: string; desc: string }[] = [
  { value: "ledgers", label: "Ledgers", desc: "Chart of accounts" },
  { value: "parties", label: "Parties", desc: "Customers & suppliers" },
  { value: "stock_items", label: "Stock Items", desc: "Products & materials" },
];

const EXPORT_ENTITIES: { value: string; label: string }[] = [
  { value: "ledgers", label: "Ledgers" },
  { value: "parties", label: "Parties" },
  { value: "stock_items", label: "Stock Items" },
];

const TALLY_SOURCES = [
  { label: "TallyPrime XML Export", icon: "✓" },
  { label: "Tally ERP 9 XML Export", icon: "✓" },
  { label: "Tally Backup (.tbk)", icon: "✓" },
  { label: "Excel export", icon: "✓" },
  { label: "ZIP company folder", icon: "✓" },
];

// ── Drag & Drop Zone ───────────────────────────────────────────────────────

function DropZone({ onFiles, children }: { onFiles: (files: File[]) => void; children: React.ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrag = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDragIn = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  const handleDragOut = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  const handleDrop = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(false); const files = Array.from(e.dataTransfer.files || []); if (files.length) onFiles(files); };
  return (
    <div onDragEnter={handleDragIn} onDragLeave={handleDragOut} onDragOver={handleDrag} onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-slate-300 dark:border-[#282832] hover:border-blue-400 dark:hover:border-blue-500/50"}`}>
      {children}
      <input ref={inputRef} type="file" multiple accept=".xml,.txt,.xlsx,.zip,.csv,.xls" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) onFiles(files); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
    </div>
  );
}

// ── Helper Components ──────────────────────────────────────────────────────

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

function ValidationDisplay({ validation }: { validation: ValidationResult }) {
  if (validation.errors.length === 0 && validation.warnings.length === 0) return null;
  return (
    <div className="border-t border-slate-200 dark:border-[#282832] pt-3">
      <h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] mb-2 text-sm">Validation Report</h4>
      {validation.errors.length > 0 && <div className="mb-2"><h5 className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Errors ({validation.errors.length})</h5><div className="max-h-32 overflow-y-auto space-y-0.5">{validation.errors.map((v, i) => <div key={i} className="text-xs text-red-500 dark:text-red-300 font-mono truncate">{v.entity}: {v.item} — {v.reason}</div>)}</div></div>}
      {validation.warnings.length > 0 && <div><h5 className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Warnings ({validation.warnings.length})</h5><div className="max-h-32 overflow-y-auto space-y-0.5">{validation.warnings.map((v, i) => <div key={i} className="text-xs text-amber-500 dark:text-amber-300 font-mono truncate">{v.entity}: {v.item} — {v.reason}</div>)}</div></div>}
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
          <div className="flex items-center gap-2 flex-wrap">{["all", "created", "skip", "info", "error"].map((s) => <button key={s} onClick={() => setFilter(s)} className={`px-2 py-0.5 text-xs rounded-full font-medium transition-colors ${filter === s ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-[#16161f] dark:text-[#cbd5e1] hover:bg-slate-200 dark:hover:bg-[#282832]"}`}>{s === "all" ? `All (${logs.length})` : `${s} (${statusCounts[s] || 0})`}</button>)}</div>
          <div className="max-h-64 overflow-y-auto space-y-0.5 bg-slate-50 dark:bg-[#0f0f17] rounded-lg p-2">
            {filtered.map((entry, i) => (<div key={i} className="flex items-start gap-2 text-xs font-mono"><span className="text-slate-400 dark:text-[#64748b] shrink-0 w-20">{new Date(entry.ts).toLocaleTimeString()}</span><span className={`shrink-0 w-16 font-medium ${LOG_STATUS_COLORS[entry.status] || LOG_STATUS_COLORS.info}`}>{entry.status}</span><span className="text-slate-600 dark:text-[#cbd5e1]">{entry.message}</span></div>))}
          </div>
        </div>
      )}
    </div>
  );
}

function statusBadge(status: string) {
  const colors: Record<string, string> = { parsed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", pending: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300", importing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", undone: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" };
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] ?? colors.pending}`}>{status}</span>;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function TallyImportPage() {
  const toast = useToastStore();
  const [activeTab, setActiveTab] = useState<"import" | "export" | "history">("import");

  // ── Import State ───────────────────────────────────────────────────────
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [importStep, setImportStep] = useState<ImportStep>("source");
  const [csvEntityType, setCsvEntityType] = useState<EntityType | "">("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<PreviewResponse | null>(null);
  const [csvResult, setCsvResult] = useState<ImportResult | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [colMap, setColMap] = useState<Record<string, string | null>>({});
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update" | "create">("skip");
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);

  // Tally import state
  const [tallyImportMode, setTallyImportMode] = useState<"current" | "new">("current");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [tallyJobs, setTallyJobs] = useState<ImportJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ImportJobDetail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{name: string; groups: number; ledgers: number; vouchers: number}[] | null>(null);

  // Folder browser state (kept in case backend integration is re-enabled)
  // States removed from UI — backend endpoints remain active.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  // Export state
  const [exportEntities, setExportEntities] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");

  // History state
  const [historyJobs, setHistoryJobs] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────────────────
  const refreshJobs = () => { api.get<ImportJob[]>("/tally-import/jobs").then(setTallyJobs).catch(() => {}); };
  const refreshHistory = () => { setHistoryLoading(true); api.get<ImportJob[]>("/tally-import/jobs").then(setHistoryJobs).catch(() => {}).finally(() => setHistoryLoading(false)); };
  useEffect(() => { refreshJobs(); refreshHistory(); }, []);
  // Refresh history whenever the tab switches to history
  useEffect(() => { if (activeTab === "history") refreshHistory(); }, [activeTab]);

  // Auto-scan the root tally-data folder when the import section mounts
  useEffect(() => { if (!selectedJob) return; function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setSelectedJob(null); } document.addEventListener("keydown", handleKey); return () => document.removeEventListener("keydown", handleKey); }, [selectedJob]);

  // ── Tally Upload ───────────────────────────────────────────────────────
  const handleTallyUpload = async (files: File[]) => {
    setBusyId("upload");
    setLastValidation(null);
    setUploadProgress(0);

    const zipFile = files.find(f => f.name.toLowerCase().endsWith(".zip"));
    const useFiles = zipFile ? [zipFile] : files;
    setUploadingFile(useFiles.map(f => f.name).join(", "));

    try {
      const fd = new FormData();
      for (const f of useFiles) { fd.append("file", f); }

      let endpoint: string;
      if (useFiles.length === 1 && !zipFile) {
        endpoint = "/tally-import/upload";
      } else if (useFiles.length === 1 && zipFile) {
        endpoint = "/tally-import/upload-archive";
      } else {
        endpoint = "/tally-import/upload-multiple";
      }

      // Use XMLHttpRequest for upload progress tracking
      const res = await new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api${endpoint}`);

        const token = getToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        const companyId = getCompanyId();
        if (companyId) xhr.setRequestHeader("X-Company-Id", companyId);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid response from server"));
            }
          } else {
            let detail = xhr.responseText;
            try { detail = JSON.parse(xhr.responseText).detail || detail; } catch {}
            reject(new Error(String(detail)));
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
      });

      setUploadProgress(100);
      setUploadedFiles(useFiles.map(f => ({
        name: f.name,
        groups: (res.summary?.groups || []).length,
        ledgers: (res.summary?.ledgers || []).length,
        vouchers: (res.summary?.vouchers || []).length,
      })));

      const total = Object.values(res.summary).reduce((s: number, arr: any) => s + (arr?.length || 0), 0);
      toast.success(`Uploaded ${useFiles.length} file${useFiles.length > 1 ? "s" : ""} — ${total} items`);
      if (res.validation) setLastValidation(res.validation);
      setImportStep("validate");
      refreshJobs();
    } catch (err: any) { toast.error(err?.message || "Upload failed"); }
    finally { setBusyId(null); setUploadingFile(null); setTimeout(() => setUploadProgress(null), 1000); }
  };

  const handleConfirm = async (jobId: string) => {
    setBusyId(jobId);
    try {
      let url = `/tally-import/jobs/${jobId}/confirm`;
      if (tallyImportMode === "new" && newCompanyName.trim()) url += `?new_company_name=${encodeURIComponent(newCompanyName.trim())}`;
      const res = await api.post<ImportJobDetail>(url, { job_id: jobId });
      const total = Object.values(res.created_details ?? {}).reduce((s: number, arr: any) => s + (arr?.length || 0), 0);
      toast.success(`Import completed: ${total} records created`);
      refreshJobs();
      setImportStep("done");
      refreshHistory();
    } catch (err: any) { toast.error(err?.detail?.detail || err?.message || "Import failed"); }
    finally { setBusyId(null); }
  };

  const handleUndo = async (jobId: string) => {
    const ok = await showConfirm("This will delete all records created by this import.\n\nRecords referenced by other data will be skipped.\nContinue?", { danger: true, confirmLabel: "Undo" });
    if (!ok) return;
    setBusyId(jobId);
    try {
      await api.post(`/tally-import/jobs/${jobId}/undo`, {});
      toast.success("Import undone successfully");
      refreshJobs();
      refreshHistory();
      setSelectedJob(null);
    } catch (err: any) { toast.error(err?.detail?.detail || err?.message || "Undo failed"); }
    finally { setBusyId(null); }
  };

  const viewJob = async (jobId: string) => {
    try { const res = await api.get<ImportJobDetail>(`/tally-import/jobs/${jobId}`); setSelectedJob(res); } catch { toast.error("Failed to load job details"); }
  };

  // ── CSV Import ─────────────────────────────────────────────────────────
  const handleCsvUpload = useCallback(async () => {
    if (!csvFile || !csvEntityType) return;
    setCsvLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const data = await api.post<PreviewResponse>(`/data-import/preview?entity_type=${csvEntityType}`, formData);
      setCsvPreview(data);
      setColMap(data.detected_mapping);
      setImportStep("preview");
    } catch (e: any) { toast.error(e?.message || "Failed to preview file"); }
    finally { setCsvLoading(false); }
  }, [csvFile, csvEntityType]);

  const handleCsvImport = useCallback(async () => {
    if (!csvFile || !csvEntityType) return;
    setCsvLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const params = new URLSearchParams({
        entity_type: csvEntityType,
        skip_duplicates: String(duplicateMode !== "create"),
      });
      if (Object.keys(colMap).length > 0) params.set("column_map", JSON.stringify(colMap));
      const data = await api.post<ImportResult>(`/data-import/import-tracked?${params}`, formData);
      setCsvResult(data);
      setImportStep("done");
      refreshHistory();
    } catch (e: any) { toast.error(e?.message || "Failed to import data"); }
    finally { setCsvLoading(false); }
  }, [csvFile, csvEntityType, duplicateMode, colMap]);

  const handleCsvUndo = async (jobId: string) => {
    const ok = await showConfirm("This will delete all records created by this CSV import.\nContinue?", { danger: true, confirmLabel: "Undo" });
    if (!ok) return;
    setBusyId(jobId);
    try {
      await api.post(`/data-import/undo/${jobId}`, {});
      toast.success("CSV import undone successfully");
      refreshHistory();
      setSelectedJob(null);
    } catch (err: any) { toast.error(err?.detail?.detail || err?.message || "Undo failed"); }
    finally { setBusyId(null); }
  };

  // ── Export ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (exportEntities.size === 0) { toast.error("Select at least one entity to export"); return; }
    for (const entityType of exportEntities) {
      try {
        const headers: Record<string, string> = {};
        const token = getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const companyId = getCompanyId();
        if (companyId) headers["X-Company-Id"] = companyId;
        const response = await fetch(`/api/data-import/export?entity_type=${entityType}&format=${exportFormat}`, { headers });
        if (!response.ok) throw new Error("Export failed");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${entityType}_export.${exportFormat}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${entityType} as ${exportFormat.toUpperCase()}`);
      } catch (e: any) { toast.error(`Failed to export ${entityType}: ${e.message}`); }
    }
  };

  const resetImport = () => {
    setImportSource(null);
    setImportStep("source");
    setCsvEntityType("");
    setCsvFile(null);
    setCsvPreview(null);
    setCsvResult(null);
    setColMap({});
    setLastValidation(null);
    setUploadedFiles(null);
    setTallyImportMode("current");
    setNewCompanyName("");
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Data Import / Export</h1>
      <p className="text-sm text-slate-500 dark:text-[#64748b] mt-1">Move your accounting data between ZLedger, Tally, CSV and Excel</p>

      <Tabs
        tabs={[
          { key: "import", label: "Import" },
          { key: "export", label: "Export" },
          { key: "history", label: "History" },
        ]}
        active={activeTab}
        onChange={(k) => setActiveTab(k as any)}
        className="mb-6"
      />

      {/* Step progress — visible during import flow */}
      {activeTab === "import" && importStep !== "source" && importSource && (
        <div className="mb-6 flex items-center gap-1">
          {["Upload & Parse", "Validation", "Preview", "Complete"].map((label, i) => {
            const steps = ["upload", "validate", "preview", "done"];
            const stepIdx = steps.indexOf(importStep);
            const isActive = i === stepIdx;
            const isDone = i < stepIdx;
            return (
              <div key={label} className="flex items-center gap-1 flex-1 min-w-0">
                <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-600"
                    : isDone
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "bg-slate-100 dark:bg-[#1a1a24] text-slate-400 dark:text-[#64748b]"
                }`}>
                  {isDone ? <span className="text-[10px]">✓</span> : <span className="text-[10px]">{i + 1}</span>}
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < 3 && <div className={`flex-1 h-0.5 rounded-full ${i < stepIdx ? "bg-green-400" : "bg-slate-200 dark:bg-[#282832]"}`} />}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* IMPORT TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "import" && (
        <>
          {/* Step 1: Source Selection */}
          {importStep === "source" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
                <h2 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9] mb-1">Select Source</h2>
                <p className="text-xs text-slate-500 dark:text-[#64748b] mb-4">What do you want to import?</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button onClick={() => { setImportSource("tally"); setImportStep("upload"); }}
                    className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-[#282832] p-5 text-left hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/5 transition-colors">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xl">T</div>
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">Tally Import</span>
                      <p className="text-xs text-slate-500 dark:text-[#64748b] mt-0.5">Migrate complete company data from Tally</p>
                    </div>
                  </button>
                  <button onClick={() => { setImportSource("csv"); setImportStep("upload"); }}
                    className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-[#282832] p-5 text-left hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/5 transition-colors">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xl">CSV</div>
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">CSV / Excel Import</span>
                      <p className="text-xs text-slate-500 dark:text-[#64748b] mt-0.5">Import ledgers, parties, or stock items</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Recent imports */}
              {historyJobs.length > 0 && (
                <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] mb-3">Recent Imports</h2>
                  <div className="divide-y divide-slate-100 dark:divide-[#1a1a24]">
                    {historyJobs.slice(0, 3).map((job) => {
                      const total = Object.values(job.summary || {}).reduce((s: number, arr: any) => s + (arr?.length || 0), 0);
                      return (
                        <div key={job.id} className="flex items-center justify-between py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-700 dark:text-[#e2e8f0] truncate">{job.filename || "Tally import"}</p>
                            <p className="text-xs text-slate-400 dark:text-[#64748b]">
                              {total} items &middot; {job.status}
                              {job.created_at && ` &middot; ${new Date(job.created_at).toLocaleDateString()}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            {job.status === "parsed" && (
                              <button onClick={() => { setSelectedJob(null); setImportStep("preview"); refreshJobs(); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">View</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Upload — Tally */}
          {importStep === "upload" && importSource === "tally" && (
            <div className="space-y-6">
              {/* ─── File Upload Section ─── */}
              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">Upload Tally Data</h2>
                    <p className="text-xs text-slate-500 dark:text-[#64748b] mt-1">Drop your Tally XML, Excel, ZIP or company backup files</p>
                  </div>
                  <button onClick={resetImport} className="text-xs text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#cbd5e1]">← Back</button>
                </div>

                {/* Upload progress bar */}
                {uploadProgress !== null && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#64748b] mb-1.5">
                      <span>{uploadingFile ? `Uploading ${uploadingFile}...` : "Uploading..."}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 dark:bg-[#1a1a24] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <DropZone onFiles={busyId === "upload" ? () => {} : handleTallyUpload}>
                  <div className="space-y-3">
                    <div className="text-4xl">📁</div>
                    <div className="text-sm font-medium text-slate-700 dark:text-[#e2e8f0]">Drop your Tally file here</div>
                    <div className="text-xs text-slate-500 dark:text-[#64748b]">or click to browse</div>
                  </div>
                </DropZone>

                <div className="mt-5 border-t border-slate-200 dark:border-[#282832] pt-4">
                  <span className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Supported sources:</span>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {TALLY_SOURCES.map((s) => <div key={s.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-[#cbd5e1]"><span className="text-green-500">{s.icon}</span>{s.label}</div>)}
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-200 dark:border-[#282832] pt-4">
                  <span className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Destination:</span>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#cbd5e1]">
                      <input type="radio" name="importMode" checked={tallyImportMode === "current"} onChange={() => setTallyImportMode("current")} className="accent-blue-600" />
                      Merge into existing company
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#cbd5e1]">
                      <input type="radio" name="importMode" checked={tallyImportMode === "new"} onChange={() => setTallyImportMode("new")} className="accent-blue-600" />
                      Create new company from backup
                    </label>
                    {tallyImportMode === "new" && (
                      <input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="New company name"
                        className="flex-1 rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-700 dark:text-[#e2e8f0]" />
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3 text-sm">
                  <span className="text-slate-500 dark:text-[#64748b]">Don't have a file?</span>
                  <a href="/api/tally-import/sample?format=xml" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2">Sample XML</a>
                  <span className="text-slate-300 dark:text-[#475569]">|</span>
                  <a href="/api/tally-import/sample?format=xlsx" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2">Sample Excel</a>
                </div>
              {lastValidation && <ValidationDisplay validation={lastValidation} />}
              </div>
            </div>
          )}

          {/* Step 2: Upload — CSV/Excel */}
          {importStep === "upload" && importSource === "csv" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">Import Data</h2>
                    <p className="text-xs text-slate-500 dark:text-[#64748b] mt-1">Select what you want to import</p>
                  </div>
                  <button onClick={resetImport} className="text-xs text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#cbd5e1]">← Back</button>
                </div>

                {/* Import Type Selection */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1] mb-3">Choose data type</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {MASTERS_ENTITIES.map((opt) => (
                      <button key={opt.value} onClick={() => { setCsvEntityType(opt.value); setCsvFile(null); }}
                        className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${csvEntityType === opt.value ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/50" : "border-slate-200 dark:border-[#282832] hover:border-slate-300 dark:hover:border-[#3a3a45]"}`}>
                        <span className="text-sm font-medium text-slate-700 dark:text-[#e2e8f0]">{opt.label}</span>
                        <span className="text-xs text-slate-500 dark:text-[#64748b]">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* File Upload */}
                {csvEntityType && (
                  <div className="space-y-4">
                    <DropZone onFiles={(files) => setCsvFile(files[0])}>
                      <div className="space-y-3">
                        <div className="text-4xl">📄</div>
                        <div className="text-sm font-medium text-slate-700 dark:text-[#e2e8f0]">
                          {csvFile ? csvFile.name : "Drop your CSV or Excel file here"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-[#64748b]">or click to browse</div>
                      </div>
                    </DropZone>

                    {/* Duplicate Handling */}
                    <div className="rounded-xl border border-slate-200 dark:border-[#282832] p-4">
                      <h4 className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1] mb-2">Duplicate Handling</h4>
                      <div className="flex flex-col gap-2">
                        {(["skip", "update", "create"] as const).map((mode) => (
                          <label key={mode} className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#cbd5e1]">
                            <input type="radio" name="dupMode" checked={duplicateMode === mode} onChange={() => setDuplicateMode(mode)} className="accent-blue-600" />
                            {mode === "skip" && "Skip duplicates (recommended)"}
                            {mode === "update" && "Update existing records"}
                            {mode === "create" && "Create duplicates"}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Expected Columns */}
                    <div className="rounded-xl bg-slate-50 dark:bg-[#0f0f16] p-4 text-xs text-slate-500 dark:text-[#64748b]">
                      <p className="font-semibold mb-1">Expected columns:</p>
                      {csvEntityType === "ledgers" && <p>Name, Group (under), Opening Balance, Opening Balance Type (Dr/Cr), GSTIN, Alias</p>}
                      {csvEntityType === "parties" && <p>Name, Party Type, GSTIN, State Code, PAN, Address, Contact Person, Phone, Email</p>}
                      {csvEntityType === "stock_items" && <p>Name, SKU, HSN/SAC Code, Unit of Measure, Opening Qty, Opening Rate, GST Rate, Reorder Level, Stock Group</p>}
                    </div>

                    {/* Templates Section */}
                    <div className="rounded-xl border border-slate-200 dark:border-[#282832] p-4">
                      <h4 className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1] mb-2">Templates</h4>
                      <div className="flex items-center gap-3">
                        <a href={`/api/data-import/sample?entity_type=${csvEntityType}&format=csv`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2 text-sm">{csvEntityType.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} CSV Template</a>
                        <span className="text-slate-300 dark:text-[#475569]">|</span>
                        <a href={`/api/data-import/sample?entity_type=${csvEntityType}&format=xlsx`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2 text-sm">{csvEntityType.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} Excel Template</a>
                      </div>
                    </div>

                    {csvFile && (
                      <button onClick={handleCsvUpload} disabled={csvLoading}
                        className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                        {csvLoading ? "Uploading..." : "Upload & Preview"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Preview — CSV */}
          {importStep === "preview" && csvPreview && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">Column Mapping</h2>
                    <p className="text-xs text-slate-500 dark:text-[#64748b] mt-1">{csvPreview.total_rows} rows detected</p>
                  </div>
                  <button onClick={() => setImportStep("upload")} className="text-xs text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#cbd5e1]">← Back</button>
                </div>
                <div className="space-y-3">
                  {Object.entries(csvPreview.detected_mapping).map(([field]) => (
                    <div key={field} className="flex items-center gap-3">
                      <label className="w-40 shrink-0 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] capitalize">{field.replace(/_/g, " ")}</label>
                      <Select value={colMap[field] || ""} onChange={(v) => setColMap((prev) => ({ ...prev, [field]: v || null }))}
                        options={[{ value: "", label: "-- Skip --" }, ...csvPreview.raw_columns.map((col) => ({ value: col, label: col }))]}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9] mb-3">Preview (first 5 rows)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-200 dark:border-[#282832]">{Object.values(colMap).filter(Boolean).map((col) => <th key={col} className="px-3 py-2 text-left font-medium text-slate-500 dark:text-[#64748b]">{col}</th>)}</tr></thead>
                    <tbody>{csvPreview.preview_rows.map((row, i) => <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]">{Object.values(colMap).filter(Boolean).map((col) => <td key={col} className="px-3 py-2 text-slate-700 dark:text-[#e2e8f0]">{row[col as string] || ""}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setImportStep("upload")} className="rounded-lg border border-slate-200 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Back</button>
                <button onClick={handleCsvImport} disabled={csvLoading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {csvLoading ? "Importing..." : `Import ${csvPreview.total_rows} Rows`}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Validate — Tally */}
          {importStep === "validate" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">Validation Report</h2>
                    <p className="text-xs text-slate-500 dark:text-[#64748b] mt-1">Review before importing</p>
                  </div>
                  <button onClick={() => { setImportStep("upload"); setUploadedFiles(null); }} className="text-xs text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#cbd5e1]">← Back</button>
                </div>

                {/* Uploaded files summary */}
                {uploadedFiles && uploadedFiles.length > 0 && (
                  <div className="mb-4 rounded-lg bg-slate-50 dark:bg-[#0f0f16] p-3">
                    <p className="text-xs font-medium text-slate-500 dark:text-[#94a3b8] mb-2">Parsed from {uploadedFiles.length} file{uploadedFiles.length > 1 ? "s" : ""}:</p>
                    <div className="space-y-1">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          <span className="text-slate-400 dark:text-[#64748b] w-5 text-right">{i+1}.</span>
                          <span className="font-medium text-slate-700 dark:text-[#e2e8f0] truncate flex-1">{f.name}</span>
                          <span className="text-slate-400 dark:text-[#64748b] shrink-0">
                            {f.groups > 0 && `${f.groups}g `}{f.ledgers > 0 && `${f.ledgers}l `}{f.vouchers > 0 && `${f.vouchers}v`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {lastValidation && lastValidation.errors.length > 0 && (
                  <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
                    <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">Issues Found ({lastValidation.errors.length})</h4>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {lastValidation.errors.map((v, i) => <div key={i} className="text-xs text-red-600 dark:text-red-300 font-mono">⚠ {v.entity}: {v.item} — {v.reason}</div>)}
                    </div>
                  </div>
                )}

                {lastValidation && lastValidation.warnings.length > 0 && (
                  <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4">
                    <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">Warnings ({lastValidation.warnings.length})</h4>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {lastValidation.warnings.map((v, i) => <div key={i} className="text-xs text-amber-600 dark:text-amber-300 font-mono">⚠ {v.entity}: {v.item} — {v.reason}</div>)}
                    </div>
                  </div>
                )}

                {(!lastValidation || (lastValidation.errors.length === 0 && lastValidation.warnings.length === 0)) && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-center">
                    <div className="text-2xl mb-2">✅</div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">All validations passed</p>
                  </div>
                )}

                <div className="flex gap-3 mt-4">
                  <button onClick={() => setImportStep("upload")} className="rounded-lg border border-slate-200 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Back</button>
                  {lastValidation && lastValidation.errors.length > 0 ? (
                    <button onClick={() => setImportStep("preview")} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Import Anyway</button>
                  ) : (
                    <button onClick={() => setImportStep("preview")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Continue to Preview</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Preview — Tally */}
          {importStep === "preview" && importSource === "tally" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">Import Preview</h2>
                    <p className="text-xs text-slate-500 dark:text-[#64748b] mt-1">Review before importing</p>
                  </div>
                  <button onClick={() => setImportStep("validate")} className="text-xs text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#cbd5e1]">← Back</button>
                </div>

                {tallyJobs.length > 0 && (() => {
                  const latest = tallyJobs[0];
                  if (!latest.summary) return null;
                  const entries = Object.entries(latest.summary).filter(([, items]) => items.length > 0);
                  const total = entries.reduce((s, [, items]) => s + items.length, 0);
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {entries.map(([key, items]) => (
                          <div key={key} className="rounded-lg bg-slate-50 dark:bg-[#0f0f16] p-3 text-center">
                            <p className="text-2xl font-bold text-slate-800 dark:text-[#f1f5f9]">{items.length}</p>
                            <p className="text-xs text-slate-500 dark:text-[#64748b]">{ENTITY_LABELS[key] || key}</p>
                          </div>
                        ))}
                      </div>
                      <div className="text-center text-sm text-slate-500 dark:text-[#64748b]">Total: {total} items ready to import</div>
                      <div className="flex gap-3 justify-center">
                        <button onClick={() => setImportStep("validate")} className="rounded-lg border border-slate-200 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Back</button>
                        <button onClick={() => { if (latest) handleConfirm(latest.id); }} disabled={busyId === latest?.id}
                          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                          {busyId === latest?.id ? "Importing..." : "Start Import"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {importStep === "done" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6 text-center">
                <div className="text-4xl mb-4">🎉</div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9] mb-2">Import Complete</h2>
                {csvResult && (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 max-w-md mx-auto mb-4">
                    <div className="rounded-lg bg-green-50 dark:bg-green-500/10 p-4">
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{csvResult.imported}</p>
                      <p className="text-xs text-green-600/70 dark:text-green-400/70">Imported</p>
                    </div>
                    <div className="rounded-lg bg-yellow-50 dark:bg-yellow-500/10 p-4">
                      <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{csvResult.skipped}</p>
                      <p className="text-xs text-yellow-600/70 dark:text-yellow-400/70">Skipped</p>
                    </div>
                    <div className="rounded-lg bg-red-50 dark:bg-red-500/10 p-4">
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">{csvResult.errors.length}</p>
                      <p className="text-xs text-red-600/70 dark:text-red-400/70">Errors</p>
                    </div>
                  </div>
                )}
                {csvResult && csvResult.errors.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg bg-red-50 dark:bg-red-500/10 p-4 text-left mb-4 max-w-md mx-auto">
                    {csvResult.errors.map((err, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{err}</p>)}
                  </div>
                )}
                <div className="flex items-center justify-center gap-3">
                  <button onClick={resetImport} className="rounded-lg border border-slate-200 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
                    Start Fresh
                  </button>
                  <button onClick={() => { setImportStep("upload"); setLastValidation(null); setUploadedFiles(null); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    Import Another File
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* EXPORT TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "export" && (
        <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6">
          <h2 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9] mb-1">Export Data</h2>
          <p className="text-xs text-slate-500 dark:text-[#64748b] mb-6">Download your data as CSV or Excel</p>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1] mb-3">Masters</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {EXPORT_ENTITIES.map((e) => (
                  <label key={e.value} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-[#282832] p-3 hover:bg-slate-50 dark:hover:bg-[#1a1a24] cursor-pointer transition-colors">
                    <input type="checkbox" checked={exportEntities.has(e.value)}
                      onChange={(ev) => { const next = new Set(exportEntities); if (ev.target.checked) next.add(e.value); else next.delete(e.value); setExportEntities(next); }}
                      className="rounded accent-blue-600" />
                    <span className="text-sm text-slate-700 dark:text-[#e2e8f0]">{e.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1] mb-3">Format</h3>
              <div className="flex gap-3">
                {(["csv", "xlsx"] as ExportFormat[]).map((fmt) => (
                  <button key={fmt} onClick={() => setExportFormat(fmt)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${exportFormat === fmt ? "bg-blue-600 text-white" : "border border-slate-200 dark:border-[#282832] text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"}`}>
                    {fmt === "csv" ? "CSV" : "Excel"}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleExport} disabled={exportEntities.size === 0}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Export {exportEntities.size > 0 ? `${exportEntities.size} ${exportEntities.size === 1 ? "entity" : "entities"}` : "Select entities above"}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HISTORY TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "history" && (
        <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-[#282832]">
            <h2 className="text-base font-semibold text-slate-800 dark:text-[#f1f5f9]">Import History</h2>
          </div>
          {historyLoading ? <ListSkeleton title="Imports" cols={4} /> : historyJobs.length === 0 ? (
            <div className="p-6 text-center text-slate-500 dark:text-[#64748b]">
              <div className="text-3xl mb-2">📭</div>
              <p>No imports yet.</p>
              <p className="text-xs mt-1">Go to the Import tab to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-[#282832]">
              {historyJobs.map((job) => (
                <div key={job.id} className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-800 dark:text-[#f1f5f9] truncate">{job.filename || "Unknown file"}</span>
                        {statusBadge(job.status)}
                        <span className="text-xs text-slate-400 dark:text-[#64748b] capitalize">{job.import_type}</span>
                      </div>
                      {job.created_counts && (
                        <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                          {Object.entries(job.created_counts).filter(([, v]) => v > 0).map(([k, v]) => `${ENTITY_LABELS[k] || k}: ${v}`).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      <button onClick={() => viewJob(job.id)} className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">View Details</button>
                      {job.status === "completed" && job.import_type === "csv" && (
                        <button onClick={() => handleCsvUndo(job.id)} disabled={busyId === job.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50">
                          Undo
                        </button>
                      )}
                      {job.status === "completed" && job.import_type === "tally" && (
                        <button onClick={() => handleUndo(job.id)} disabled={busyId === job.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50">
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">{job.created_at ? new Date(job.created_at).toLocaleString() : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* JOB DETAIL MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {selectedJob && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={() => setSelectedJob(null)}>
          <div className="bg-white dark:bg-[#16161f] rounded-lg border border-slate-200 dark:border-[#282832] p-6 max-w-xl w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9] mb-4">{selectedJob.filename || "Import Job"}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-[#64748b]">Status</span>{statusBadge(selectedJob.status)}</div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-[#64748b]">Type</span><span className="text-slate-800 dark:text-[#f1f5f9] capitalize">{selectedJob.import_type}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-[#64748b]">File</span><span className="text-slate-800 dark:text-[#f1f5f9]">{selectedJob.filename || "—"}</span></div>
              {selectedJob.created_at && <div className="flex justify-between"><span className="text-slate-500 dark:text-[#64748b]">Imported at</span><span className="text-slate-800 dark:text-[#f1f5f9]">{new Date(selectedJob.created_at).toLocaleString()}</span></div>}
              {selectedJob.summary && selectedJob.status !== "failed" && (() => {
                const entries = Object.entries(selectedJob.summary).filter(([, items]) => items.length > 0);
                if (entries.length === 0) return null;
                return <div className="border-t border-slate-200 dark:border-[#282832] pt-3"><h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] mb-2 text-sm">Preview</h4>{entries.map(([key, items]) => <SummarySection key={key} title={ENTITY_LABELS[key] || key} items={items} />)}</div>;
              })()}
              {selectedJob.created_details && selectedJob.status === "completed" && (() => {
                const entries = Object.entries(selectedJob.created_details).filter(([, items]) => items.length > 0);
                if (entries.length === 0) return null;
                return <div className="border-t border-slate-200 dark:border-[#282832] pt-3"><h4 className="font-medium text-green-700 dark:text-green-400 mb-2 text-sm">Created Records</h4>{entries.map(([key, items]) => <DetailSection key={key} title={ENTITY_LABELS[key] || key} items={items} renderItem={(item: CreatedDetailItem) => {
                  if (item.voucher_number) return `#${item.voucher_number} — ${item.voucher_type} (${item.voucher_date})`;
                  if (item.name && item.opening_balance !== undefined) return `${item.name} → ${item.group} (₹${item.opening_balance.toLocaleString("en-IN")})`;
                  return item.name || "";
                }} />)}</div>;
              })()}
              {selectedJob.status === "undone" && selectedJob.errors && "removed" in selectedJob.errors && (
                <div className="border-t border-slate-200 dark:border-[#282832] pt-3">
                  <h4 className="font-medium text-sm mb-1">Undo Result</h4>
                  <p className="text-xs text-slate-600 dark:text-[#cbd5e1]">Removed: {(selectedJob.errors as any).removed} records</p>
                  <p className="text-xs text-slate-600 dark:text-[#cbd5e1]">Skipped: {(selectedJob.errors as any).skipped} records (referenced by other data)</p>
                </div>
              )}
              {selectedJob.errors && selectedJob.status === "failed" && (
                <div className="border-t border-slate-200 dark:border-[#282832] pt-3">
                  <h4 className="font-medium text-red-700 dark:text-red-400 mb-1">Errors</h4>
                  <pre className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg overflow-auto max-h-32">{JSON.stringify(selectedJob.errors, null, 2)}</pre>
                </div>
              )}
              {selectedJob.logs && selectedJob.logs.length > 0 && <DetailedLogs logs={selectedJob.logs} />}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setSelectedJob(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-[#cbd5e1] hover:text-slate-800 dark:hover:text-[#f1f5f9]">Close</button>
              {selectedJob.status === "parsed" && <button onClick={() => handleConfirm(selectedJob.id)} disabled={busyId === selectedJob.id} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">{busyId === selectedJob.id ? "Importing..." : "Confirm Import"}</button>}
              {selectedJob.status === "completed" && <button onClick={() => handleUndo(selectedJob.id)} disabled={busyId === selectedJob.id} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">{busyId === selectedJob.id ? "Undoing..." : "Undo Import"}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
