import { useEffect, useState, useRef, useCallback } from "react";
import { api, getToken } from "../api/client";
import { useToastStore } from "../store/toast";
import { ListSkeleton } from "./skeletons";
import PageHeader from "../components/PageHeader";

interface BackupFile {
  filename: string;
  size_bytes: number;
  created_at: string;
  type: "database" | "uploads";
}

interface GDriveSync {
  gdrive_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_files: string[];
  last_sync_duration_seconds: number | null;
  last_error: string | null;
}

interface BackupStatus {
  backup_dir: string;
  database_backups: BackupFile[];
  uploads_backups: BackupFile[];
  total_backups: number;
  gdrive_sync: GDriveSync | null;
}

interface BackupLogEntry {
  type: string;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  gdrive_enabled: boolean | null;
}

interface BackupProgress {
  step: string;
  step_label: string;
  status: string;
  timestamp: string;
  dump_file: string | null;
  uploads_file: string | null;
}

const STEPS = [
  { key: "db_dump", label: "Database dump" },
  { key: "uploads", label: "Uploads backup" },
  { key: "rotation", label: "Rotation" },
  { key: "gdrive", label: "Google Drive sync" },
  { key: "done", label: "Complete" },
];

function getStepIndex(step: string): number {
  if (step === "db_dump" || step === "db_dump_done") return 0;
  if (step === "uploads" || step === "uploads_done") return 1;
  if (step === "rotation" || step === "rotation_done") return 2;
  if (step === "gdrive") return 3;
  if (step === "done") return 4;
  return 0;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

async function downloadBackup(filename: string) {
  const token = getToken();
  const res = await fetch(`/api/admin/backups/download/${encodeURIComponent(filename)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Download failed" }));
    throw new Error(err.detail || "Download failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminBackupPage() {
  const toast = useToastStore();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [logs, setLogs] = useState<BackupLogEntry[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasPollingRef = useRef(false);

  const loadStatus = async () => {
    try {
      const data = await api.get<BackupStatus>("/admin/backups");
      setStatus(data);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load backup status");
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await api.get<BackupLogEntry[]>("/admin/backups/logs");
      setLogs(data);
    } catch {
      // Silently fail - logs are optional
    }
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    wasPollingRef.current = false;
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => {
      setShowModal(false);
      setProgress(null);
    }, 200);
  }, []);

  useEffect(() => { loadStatus(); loadLogs(); }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleBackup = async () => {
    setBacking(true);
    setProgress(null);
    setShowModal(true);
    // Trigger enter animation after render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setModalVisible(true));
    });
    try {
      const res = await api.post<{ status: string; message: string; gdrive_enabled: boolean }>(
        "/admin/backup/trigger",
        {}
      );
      toast.success(res.message);
      wasPollingRef.current = true;
      pollRef.current = setInterval(async () => {
        try {
          const data = await api.get<BackupProgress>("/admin/backup/progress");
          setProgress(data);
          if (data.status === "done" || data.status === "error") {
            stopPolling();
            setBacking(false);
            loadStatus();
            loadLogs();
            if (data.status === "done") {
              toast.success("Backup completed successfully");
              setTimeout(closeModal, 1200);
            } else {
              toast.error("Backup failed");
            }
          }
        } catch {
          if (wasPollingRef.current) {
            stopPolling();
            setBacking(false);
            loadStatus();
            closeModal();
          }
        }
      }, 2000);
    } catch (err: any) {
      toast.error(err?.message || "Failed to trigger backup");
      setBacking(false);
      closeModal();
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Backup Management" />
        <ListSkeleton title="Backups" cols={4} />
      </div>
    );
  }

  const currentStepIndex = progress ? getStepIndex(progress.step) : -1;
  const progressPercent = currentStepIndex >= 0 ? Math.round(((currentStepIndex + 1) / STEPS.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup Management"
        actions={
          <button
            onClick={handleBackup}
            disabled={backing}
            className="flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 disabled:opacity-50"
          >
            {backing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Backing up...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Backup Now
              </>
            )}
          </button>
        }
      />

      {/* Progress Modal */}
      {showModal && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-200 ${
            modalVisible ? "bg-black/50 backdrop-blur-sm" : "bg-black/0"
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget && progress?.status === "done") closeModal();
          }}
        >
          <div
            className={`w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#1e1e2a] transition-all duration-200 ${
              modalVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {progress?.status === "done" ? "Backup Complete" : "Backing Up..."}
              </h3>
              {progress?.status === "done" && (
                <button
                  onClick={closeModal}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#282832]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {progress && (
              <>
                <p className="mb-3 text-sm text-slate-500 dark:text-[#8b8b9e]">
                  {progress.step_label}
                </p>

                {/* Progress bar */}
                <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#282832]">
                  <div
                    className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Step indicators */}
                <div className="flex items-center justify-between">
                  {STEPS.map((step, i) => {
                    const isDone = currentStepIndex > i || (currentStepIndex === i && progress.step.endsWith("_done"));
                    const isCurrent = currentStepIndex === i && !progress.step.endsWith("_done");
                    return (
                      <div key={step.key} className="flex flex-col items-center">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors duration-300 ${
                            isDone
                              ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                              : isCurrent
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 ring-2 ring-blue-200 dark:ring-blue-500/30"
                              : "bg-slate-100 text-slate-400 dark:bg-[#282832] dark:text-[#64748b]"
                          }`}
                        >
                          {isDone ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </div>
                        <span
                          className={`mt-1.5 text-[10px] font-medium transition-colors duration-300 ${
                            isCurrent ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-[#64748b]"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* GDrive Status */}
      {status?.gdrive_sync && (
        <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">Google Drive Sync</h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-[#8b8b9e]">Status: </span>
              <span className={`font-medium ${status.gdrive_sync.last_sync_status === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {status.gdrive_sync.gdrive_enabled ? (status.gdrive_sync.last_sync_status || "Enabled") : "Disabled"}
              </span>
            </div>
            {status.gdrive_sync.last_sync_at && (
              <div>
                <span className="text-slate-500 dark:text-[#8b8b9e]">Last sync: </span>
                <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{formatDate(status.gdrive_sync.last_sync_at)}</span>
              </div>
            )}
            {status.gdrive_sync.last_sync_duration_seconds != null && (
              <div>
                <span className="text-slate-500 dark:text-[#8b8b9e]">Duration: </span>
                <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{status.gdrive_sync.last_sync_duration_seconds}s</span>
              </div>
            )}
            {status.gdrive_sync.last_error && (
              <div className="col-span-2">
                <span className="text-red-600 dark:text-red-400">{status.gdrive_sync.last_error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backups — side-by-side tables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Database Backups */}
        <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-[#e2e8f0]">
              Database Backups <span className="text-slate-400 dark:text-[#64748b]">({status?.database_backups.length || 0})</span>
            </h3>
          </div>
          <div className="overflow-y-auto flex-1 max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-[#16161f] dark:text-[#94a3b8]">
                  <th className="px-4 py-2">Filename</th>
                  <th className="px-4 py-2">Size</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1e1e28]">
                {status?.database_backups.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-[#64748b]">No backups found.</td></tr>
                ) : (
                  status?.database_backups.map((b) => (
                    <tr key={b.filename} className="hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors">
                      <td className="px-4 py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{b.filename}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-[#94a3b8]">{formatSize(b.size_bytes)}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-[#94a3b8]">{formatDate(b.created_at)}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => downloadBackup(b.filename).catch((e) => toast.error(e.message))}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-[#282832] dark:hover:text-blue-400 transition-colors"
                          title="Download"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Uploads Backups */}
        <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-[#e2e8f0]">
              Uploads Backups <span className="text-slate-400 dark:text-[#64748b]">({status?.uploads_backups.length || 0})</span>
            </h3>
          </div>
          <div className="overflow-y-auto flex-1 max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-[#16161f] dark:text-[#94a3b8]">
                  <th className="px-4 py-2">Filename</th>
                  <th className="px-4 py-2">Size</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1e1e28]">
                {status?.uploads_backups.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-[#64748b]">No backups found.</td></tr>
                ) : (
                  status?.uploads_backups.map((b) => (
                    <tr key={b.filename} className="hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors">
                      <td className="px-4 py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{b.filename}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-[#94a3b8]">{formatSize(b.size_bytes)}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-[#94a3b8]">{formatDate(b.created_at)}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => downloadBackup(b.filename).catch((e) => toast.error(e.message))}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-[#282832] dark:hover:text-blue-400 transition-colors"
                          title="Download"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Backup Logs */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-[#e2e8f0]">
            Backup Logs <span className="text-slate-400 dark:text-[#64748b]">({logs.length})</span>
          </h3>
        </div>
        <div className="overflow-y-auto max-h-[300px]">
          {logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-[#64748b]">
              No backup logs yet. Run a backup to see logs here.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-[#16161f] dark:text-[#94a3b8]">
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Triggered By</th>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2">Duration</th>
                  <th className="px-4 py-2">GDrive</th>
                  <th className="px-4 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1e1e28]">
                {logs.slice().reverse().map((log, i) => {
                  const duration = log.started_at && log.completed_at
                    ? ((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000).toFixed(1)
                    : null;
                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors">
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.type === "backup_completed"
                            ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                            : log.type === "backup_failed"
                            ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                        }`}>
                          {log.type === "backup_completed" ? "Success" : log.type === "backup_failed" ? "Failed" : "Started"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-[#94a3b8]">{log.triggered_by || "-"}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-[#94a3b8]">
                        {log.started_at ? formatDate(log.started_at) : "-"}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-[#94a3b8]">
                        {duration ? `${duration}s` : "-"}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-[#94a3b8]">
                        {log.gdrive_enabled != null ? (log.gdrive_enabled ? "Yes" : "No") : "-"}
                      </td>
                      <td className="px-4 py-2 text-red-600 dark:text-red-400 max-w-[200px] truncate">
                        {log.error || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
