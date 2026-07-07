import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { ListSkeleton } from "./skeletons";

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

export default function AdminBackupPage() {
  const toast = useToastStore();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const checkProgress = useCallback(async () => {
    try {
      const data = await api.get<BackupProgress>("/admin/backup/progress");
      setProgress(data);
      if (data.status === "done" || data.status === "error") {
        stopPolling();
        setBacking(false);
        loadStatus();
        if (data.status === "done") {
          toast.success("Backup completed successfully");
        } else {
          toast.error("Backup failed");
        }
      }
    } catch {
      // 204 means no backup in progress — check if we were tracking one
      if (progress) {
        stopPolling();
        setBacking(false);
        loadStatus();
      }
    }
  }, [progress]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(checkProgress, 2000);
  }, [checkProgress]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setProgress(null);
  }, []);

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleBackup = async () => {
    setBacking(true);
    setProgress(null);
    try {
      const res = await api.post<{ status: string; message: string; gdrive_enabled: boolean }>(
        "/admin/backup/trigger",
        {}
      );
      toast.success(res.message);
      startPolling();
    } catch (err: any) {
      toast.error(err?.message || "Failed to trigger backup");
      setBacking(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Backup Management</h2>
        <ListSkeleton title="Backups" cols={4} />
      </div>
    );
  }

  const currentStepIndex = progress ? getStepIndex(progress.step) : -1;
  const progressPercent = currentStepIndex >= 0 ? Math.round(((currentStepIndex + 1) / STEPS.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] pb-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Backup Management</h2>
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
      </div>

      {/* Progress Bar */}
      {progress && (
        <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
              {progress.step_label}
            </h3>
            <span className="text-xs font-medium text-slate-500 dark:text-[#8b8b9e]">
              {progressPercent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-[#282832] overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="mt-4 flex items-center justify-between">
            {STEPS.map((step, i) => {
              const isDone = currentStepIndex > i || (currentStepIndex === i && progress.step.endsWith("_done"));
              const isCurrent = currentStepIndex === i && !progress.step.endsWith("_done");
              return (
                <div key={step.key} className="flex flex-col items-center">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
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
                  <span className={`mt-1.5 text-[10px] font-medium ${isCurrent ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-[#64748b]"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GDrive Status */}
      {status?.gdrive_sync && !progress && (
        <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">Google Drive Sync</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
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

      {/* Database Backups */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 dark:border-[#1a1a24] px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
            Database Backups ({status?.database_backups.length || 0})
          </h3>
        </div>
        {status?.database_backups.length === 0 ? (
          <p className="p-5 text-center text-sm text-slate-400 dark:text-[#64748b]">No database backups found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                <th className="px-5 py-3">Filename</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {status?.database_backups.map((b) => (
                <tr key={b.filename} className="border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-[#f1f5f9]">{b.filename}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-[#cbd5e1]">{formatSize(b.size_bytes)}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-[#cbd5e1]">{formatDate(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Uploads Backups */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 dark:border-[#1a1a24] px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
            Uploads Backups ({status?.uploads_backups.length || 0})
          </h3>
        </div>
        {status?.uploads_backups.length === 0 ? (
          <p className="p-5 text-center text-sm text-slate-400 dark:text-[#64748b]">No uploads backups found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                <th className="px-5 py-3">Filename</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {status?.uploads_backups.map((b) => (
                <tr key={b.filename} className="border-b border-slate-100 dark:border-[#1a1a24] hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-[#f1f5f9]">{b.filename}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-[#cbd5e1]">{formatSize(b.size_bytes)}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-[#cbd5e1]">{formatDate(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
