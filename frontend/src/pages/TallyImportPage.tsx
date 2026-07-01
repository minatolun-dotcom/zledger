import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface SummaryItem {
  name?: string;
  voucher_number?: string;
  voucher_type?: string;
  date?: string;
  group?: string;
  parent?: string;
  type?: string;
  qty?: number;
}

interface CreatedDetailItem {
  id?: string;
  name?: string;
  voucher_number?: string;
  voucher_type?: string;
  voucher_date?: string;
  date?: string;
  narration?: string;
  group?: string;
  opening_balance?: number;
  opening_qty?: number;
  type?: string;
  total?: number;
}

interface ImportJob {
  id: string;
  import_type: string;
  filename: string | null;
  status: string;
  summary: Record<string, SummaryItem[]> | null;
  created_counts: Record<string, number> | null;
  created_at: string | null;
}

interface ImportJobDetail extends ImportJob {
  company_id: string;
  user_id: string;
  errors: Record<string, unknown> | null;
  created_details: Record<string, CreatedDetailItem[]> | null;
  total_value: number | null;
  updated_at: string | null;
}

interface UploadResponse {
  job_id: string;
  summary: Record<string, SummaryItem[]>;
}

const ENTITY_LABELS: Record<string, string> = {
  groups: "Groups",
  ledgers: "Ledgers",
  parties: "Parties",
  stock_groups: "Stock Groups",
  stock_items: "Stock Items",
  units: "Units",
  vouchers: "Vouchers",
};

function DetailSection({ title, items, renderItem }: {
  title: string;
  items: any[];
  renderItem: (item: any, i: number) => string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="border-t border-slate-200 dark:border-[#252530] pt-3 first:border-t-0 first:pt-0">
      <h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] mb-1.5 text-sm">
        {title} <span className="text-slate-400 dark:text-[#64748b] font-normal">({items.length})</span>
      </h4>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {items.map((item, i) => (
          <div key={i} className="text-xs text-slate-600 dark:text-[#94a3b8] font-mono truncate">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummarySection({ title, items }: { title: string; items: SummaryItem[] }) {
  return (
    <DetailSection
      title={title}
      items={items}
      renderItem={(item: SummaryItem) => {
        if (item.voucher_number) return `#${item.voucher_number} — ${item.voucher_type} (${item.date})`;
        if (item.name && item.group) return `${item.name} → ${item.group}`;
        if (item.name && item.parent) return `${item.name} under ${item.parent}`;
        if (item.name && item.type) return `${item.name} (${item.type})`;
        return item.name || item.voucher_number || "";
      }}
    />
  );
}

function CreatedSection({ title, items }: { title: string; items: CreatedDetailItem[] }) {
  return (
    <DetailSection
      title={title}
      items={items}
      renderItem={(item: CreatedDetailItem) => {
        if (item.voucher_number) {
          const totalStr = item.total ? ` ₹${item.total.toLocaleString("en-IN")}` : "";
          return `#${item.voucher_number} — ${item.voucher_type} (${item.voucher_date})${totalStr}`;
        }
        if (item.name && item.opening_balance !== undefined) {
          return `${item.name} → ${item.group} (₹${item.opening_balance.toLocaleString("en-IN")})`;
        }
        if (item.name && item.opening_qty !== undefined) {
          return `${item.name} → ${item.group} (qty: ${item.opening_qty})`;
        }
        if (item.name && item.type) return `${item.name} (${item.type})`;
        return item.name || item.voucher_number || "";
      }}
    />
  );
}

export default function TallyImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ImportJobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = () => {
    setLoading(true);
    api.get<ImportJob[]>("/tally-import/jobs")
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError("");
    setSuccess("");
    setBusyId("upload");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<UploadResponse>("/tally-import/upload", formData);
      const total = Object.values(res.summary).reduce((s: number, arr: any) => s + (arr?.length || 0), 0);
      setSuccess(`Uploaded "${file.name}" — ${total} items found`);
      fileRef.current.value = "";
      refresh();
    } catch (err: any) {
      setError(err?.detail?.detail || err?.detail || "Upload failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirm = async (jobId: string) => {
    setError("");
    setSuccess("");
    setBusyId(jobId);
    try {
      const res = await api.post<ImportJobDetail>(`/tally-import/jobs/${jobId}/confirm`, { job_id: jobId });
      const total = Object.values(res.created_details ?? {}).reduce((s: number, arr: any) => s + (arr?.length || 0), 0);
      setSuccess(`Import completed: ${total} records created`);
      refresh();
      setSelectedJob(res);
    } catch (err: any) {
      setError(err?.detail?.detail || err?.detail || "Import failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleUndo = async (jobId: string) => {
    const ok = window.confirm(
      "This will delete all records created by this import.\n\n" +
      "Records that are referenced by other data will be skipped.\n" +
      "Continue?"
    );
    if (!ok) return;
    setError("");
    setSuccess("");
    setBusyId(jobId);
    try {
      const res = await api.post<ImportJobDetail>(`/tally-import/jobs/${jobId}/undo`, {});
      setSuccess(`Import undone successfully`);
      refresh();
      setSelectedJob(res);
    } catch (err: any) {
      setError(err?.detail?.detail || err?.detail || "Undo failed");
    } finally {
      setBusyId(null);
    }
  };

  const viewJob = async (jobId: string) => {
    try {
      const res = await api.get<ImportJobDetail>(`/tally-import/jobs/${jobId}`);
      setSelectedJob(res);
    } catch {
      setError("Failed to load job details");
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      parsed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      pending: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
      importing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      undone: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] ?? colors.pending}`}>
        {status}
      </span>
    );
  };

  const renderPreviewSections = (summary: Record<string, SummaryItem[]>) => {
    const entries = Object.entries(summary).filter(([, items]) => items.length > 0);
    if (entries.length === 0) return null;
    return (
      <div className="border-t border-slate-200 dark:border-[#252530] pt-3">
        <h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] mb-2 text-sm">Preview</h4>
        {entries.map(([key, items]) => (
          <SummarySection key={key} title={ENTITY_LABELS[key] || key} items={items} />
        ))}
      </div>
    );
  };

  const renderCreatedSections = (details: Record<string, CreatedDetailItem[]>) => {
    const entries = Object.entries(details).filter(([, items]) => items.length > 0);
    if (entries.length === 0) return null;
    return (
      <div className="border-t border-slate-200 dark:border-[#252530] pt-3">
        <h4 className="font-medium text-green-700 dark:text-green-400 mb-2 text-sm">Created Records</h4>
        {entries.map(([key, items]) => (
          <CreatedSection key={key} title={ENTITY_LABELS[key] || key} items={items} />
        ))}
      </div>
    );
  };

  const renderUndoResult = (errors: any, createdDetails: Record<string, CreatedDetailItem[]> | null) => {
    if (!errors || !errors.removed) return null;
    const removed = errors.removed as Record<string, any[]>;
    const skipped = errors.skipped as Record<string, any[]>;
    const totalRemoved = Object.values(removed).reduce((s: number, arr: any) => s + (arr?.length || 0), 0);
    const totalSkipped = Object.values(skipped).reduce((s: number, arr: any) => s + (arr?.length || 0), 0);

    return (
      <>
        {/* Show what was originally created */}
        {createdDetails && renderCreatedSections(createdDetails)}

        {/* Show undo outcome */}
        <div className="border-t border-slate-200 dark:border-[#252530] pt-3 space-y-2">
          <h4 className="font-medium text-sm">Undo Result</h4>
          <div className="text-xs text-green-700 dark:text-green-400 font-medium">
            Removed ({totalRemoved})
          </div>
          {Object.entries(removed).filter(([, items]) => items.length > 0).map(([key, items]) => (
            <div key={key} className="text-xs text-slate-600 dark:text-[#94a3b8] pl-3">
              {ENTITY_LABELS[key] || key}: {items.length}
            </div>
          ))}
          {totalSkipped > 0 && (
            <>
              <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                Skipped — in use elsewhere ({totalSkipped})
              </div>
              {Object.entries(skipped).filter(([, items]) => items.length > 0).map(([key, items]) => (
                <div key={key} className="text-xs text-amber-600 dark:text-amber-400 pl-3">
                  {ENTITY_LABELS[key] || key}: {items.length}
                </div>
              ))}
            </>
          )}
        </div>
      </>
    );
  };

  const renderModalContent = (job: ImportJobDetail) => {
    const content: JSX.Element[] = [];

    // Summary preview — show for all states except failed
    if (job.summary && job.status !== "failed") {
      content.push(renderPreviewSections(job.summary)!);
    }

    // Created details — show for completed and undone
    if (job.created_details && (job.status === "completed" || job.status === "undone")) {
      if (job.status === "completed") {
        content.push(renderCreatedSections(job.created_details)!);
      }
    }

    // Undo result
    if (job.status === "undone") {
      content.push(renderUndoResult(job.errors, job.created_details)!);
    }

    // Errors
    if (job.errors && job.status === "failed") {
      content.push(
        <div key="errors" className="border-t border-slate-200 dark:border-[#252530] pt-3">
          <h4 className="font-medium text-red-700 dark:text-red-400 mb-1">Errors</h4>
          <pre className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(job.errors, null, 2)}
          </pre>
        </div>
      );
    }

    return content.length > 0 ? (
      <div className="space-y-3 text-sm">
        {content}
      </div>
    ) : null;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-[#f1f5f9] mb-6">Tally Import</h1>

      {/* Upload Section */}
      <div className="bg-white dark:bg-[#18181f] rounded-lg border border-slate-200 dark:border-[#252530] p-6 mb-8">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9] mb-4">Upload Tally XML</h2>
        <div className="flex items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".xml,.txt"
            className="block w-full text-sm text-slate-500 dark:text-[#64748b] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 dark:file:bg-violet-900/30 dark:file:text-violet-300 hover:file:bg-violet-100 dark:hover:file:bg-violet-900/50"
          />
          <button
            onClick={handleUpload}
            disabled={busyId === "upload" || !fileRef.current?.files?.[0]}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {busyId === "upload" ? "Uploading..." : "Upload & Preview"}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {typeof error === "string" ? error : JSON.stringify(error)}
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
          {success}
        </div>
      )}

      {/* Jobs List */}
      <div className="bg-white dark:bg-[#18181f] rounded-lg border border-slate-200 dark:border-[#252530] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#252530]">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9]">Import History</h2>
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-500 dark:text-[#64748b]">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="p-6 text-center text-slate-500 dark:text-[#64748b]">No imports yet. Upload a Tally XML file above.</div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-[#252530]">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1e1e28] cursor-pointer"
                onClick={() => viewJob(job.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-800 dark:text-[#f1f5f9] truncate">
                      {job.filename || "Unknown file"}
                    </span>
                    {statusBadge(job.status)}
                  </div>
                  {job.created_counts && (
                    job.status === "undone" ? (
                      <div className="mt-1 text-xs text-purple-600 dark:text-purple-400">
                        Was: {Object.entries(job.created_counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                        Created: {Object.entries(job.created_counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                      </div>
                    )
                  )}
                </div>
                <div className="ml-4 text-xs text-slate-400 dark:text-[#64748b]">
                  {job.created_at ? new Date(job.created_at).toLocaleDateString() : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={() => setSelectedJob(null)}>
          <div className="bg-white dark:bg-[#18181f] rounded-lg border border-slate-200 dark:border-[#252530] p-6 max-w-xl w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9] mb-4">
              {selectedJob.filename || "Import Job"}
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#64748b]">Status</span>
                {statusBadge(selectedJob.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#64748b]">Type</span>
                <span className="text-slate-800 dark:text-[#f1f5f9] capitalize">{selectedJob.import_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#64748b]">File</span>
                <span className="text-slate-800 dark:text-[#f1f5f9]">{selectedJob.filename || "—"}</span>
              </div>
              {selectedJob.created_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-[#64748b]">Imported at</span>
                  <span className="text-slate-800 dark:text-[#f1f5f9]">{new Date(selectedJob.created_at).toLocaleString()}</span>
                </div>
              )}

              {/* Dynamic content based on status */}
              {renderModalContent(selectedJob)}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-[#cbd5e1] hover:text-slate-800 dark:hover:text-white"
              >
                Close
              </button>
              {selectedJob.status === "parsed" && (
                <button
                  onClick={() => handleConfirm(selectedJob.id)}
                  disabled={busyId === selectedJob.id}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {busyId === selectedJob.id ? "Importing..." : "Confirm Import"}
                </button>
              )}
              {selectedJob.status === "completed" && (
                <button
                  onClick={() => handleUndo(selectedJob.id)}
                  disabled={busyId === selectedJob.id}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {busyId === selectedJob.id ? "Undoing..." : "Undo Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
