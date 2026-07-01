import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface ImportJob {
  id: string;
  import_type: string;
  filename: string | null;
  status: string;
  summary: Record<string, number> | null;
  created_counts: Record<string, number> | null;
  created_at: string | null;
}

interface ImportJobDetail extends ImportJob {
  company_id: string;
  user_id: string;
  errors: Record<string, unknown> | null;
  total_value: number | null;
  updated_at: string | null;
}

interface UploadResponse {
  job_id: string;
  summary: Record<string, number>;
}

export default function TallyImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ImportJobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
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
    setImporting("upload");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<UploadResponse>("/tally-import/upload", formData);
      setSuccess(`Uploaded "${file.name}" — ${JSON.stringify(res.summary)}`);
      fileRef.current.value = "";
      refresh();
    } catch (err: any) {
      setError(err?.detail?.detail || err?.detail || "Upload failed");
    } finally {
      setImporting(null);
    }
  };

  const handleConfirm = async (jobId: string) => {
    setError("");
    setSuccess("");
    setImporting(jobId);
    try {
      const res = await api.post<ImportJobDetail>(`/tally-import/jobs/${jobId}/confirm`, { job_id: jobId });
      setSuccess(`Import completed: ${JSON.stringify(res.created_counts)}`);
      refresh();
      setSelectedJob(null);
    } catch (err: any) {
      setError(err?.detail?.detail || err?.detail || "Import failed");
    } finally {
      setImporting(null);
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
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] ?? colors.pending}`}>
        {status}
      </span>
    );
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
            disabled={importing === "upload" || !fileRef.current?.files?.[0]}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {importing === "upload" ? "Uploading..." : "Upload & Preview"}
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
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm whitespace-pre-wrap font-mono text-xs">
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
                  {job.summary && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-[#64748b]">
                      {Object.entries(job.summary).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                    </div>
                  )}
                  {job.created_counts && (
                    <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                      Created: {Object.entries(job.created_counts).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                    </div>
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
          <div className="bg-white dark:bg-[#18181f] rounded-lg border border-slate-200 dark:border-[#252530] p-6 max-w-lg w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
              {selectedJob.summary && (
                <div className="border-t border-slate-200 dark:border-[#252530] pt-3">
                  <h4 className="font-medium text-slate-700 dark:text-[#cbd5e1] mb-2">Preview</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(selectedJob.summary).filter(([, v]) => v > 0).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-[#64748b] capitalize">{k}</span>
                        <span className="text-slate-800 dark:text-[#f1f5f9] font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedJob.created_counts && (
                <div className="border-t border-slate-200 dark:border-[#252530] pt-3">
                  <h4 className="font-medium text-green-700 dark:text-green-400 mb-2">Created</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(selectedJob.created_counts).filter(([, v]) => v > 0).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-[#64748b] capitalize">{k}</span>
                        <span className="text-green-600 dark:text-green-400 font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedJob.errors && (
                <div className="border-t border-slate-200 dark:border-[#252530] pt-3">
                  <h4 className="font-medium text-red-700 dark:text-red-400 mb-1">Errors</h4>
                  <pre className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(selectedJob.errors, null, 2)}
                  </pre>
                </div>
              )}
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
                  disabled={importing === selectedJob.id}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {importing === selectedJob.id ? "Importing..." : "Confirm Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
