import { useEffect, useState, useRef, useCallback } from "react";
import { api, getToken } from "../api/client";
import { useToastStore } from "../store/toast";
import { useAuthStore } from "../store/auth";
import { ListSkeleton } from "./skeletons";
import Modal from "../components/Modal";
import RestoreBackupModal from "../components/RestoreBackupModal";
import { showConfirm } from "../components/ConfirmDialog";


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
  disk_usage: { total: number; used: number; free: number } | null;
}

interface BackupLogEntry {
  type: string;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  filename: string | null;
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

interface BackupSettings {
  backup_dir: string;
  backup_interval_hours: number;
  retention_days: number;
  gdrive_enabled: boolean;
  gdrive_token_set: boolean;
  gdrive_account_email: string | null;
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

/** Backups older than the retention cutoff — used for the prune estimate. */
function getPruneEligible(status: BackupStatus | null, retentionDays: number | null) {
  if (!status || retentionDays == null) return { count: 0, bytes: 0 };
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const old = [...status.database_backups, ...status.uploads_backups].filter(
    (b) => new Date(b.created_at).getTime() < cutoff
  );
  return { count: old.length, bytes: old.reduce((s, b) => s + b.size_bytes, 0) };
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

  const [logs, setLogs] = useState<BackupLogEntry[]>([]);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [gdriveToken, setGdriveToken] = useState("");
  const [testingGdrive, setTestingGdrive] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"schedule" | "gdrive">("schedule");
  const [showRestore, setShowRestore] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);
  const { user: currentUser } = useAuthStore();
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

  const loadSettings = async () => {
    try {
      const data = await api.get<BackupSettings>("/admin/backup/settings");
      setSettings(data);
    } catch { /* ignore */ }
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    wasPollingRef.current = false;
  }, []);

  const closeModal = useCallback(() => {

    setTimeout(() => {
      setShowModal(false);
      setProgress(null);
    }, 200);
  }, []);

  useEffect(() => { loadStatus(); loadLogs(); loadSettings(); }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      const data = await api.put<BackupSettings>("/admin/backup/settings", {
        backup_interval_hours: settings.backup_interval_hours,
        retention_days: settings.retention_days,
        gdrive_enabled: settings.gdrive_enabled,
      });
      setSettings(data);
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save settings");
    }
  };

  const handleSaveGdriveToken = async () => {
    const trimmed = gdriveToken.trim();
    if (!trimmed) return;
    // Validate JSON format before sending
    try {
      JSON.parse(trimmed);
    } catch {
      toast.error("Invalid JSON format. Paste the exact token from 'rclone authorize drive'.");
      return;
    }
    // Confirm if overwriting existing config
    if (settings?.gdrive_token_set) {
      const confirmed = window.confirm("Replace existing GDrive token? This will overwrite the current Google Drive credentials.");
      if (!confirmed) return;
    }
    try {
      await api.post("/admin/backup/gdrive-token", { token: trimmed });
      setGdriveToken("");
      toast.success("GDrive token saved. GDrive is now enabled — the next backup will sync to Drive.");
      loadSettings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save token");
    }
  };

  const handleClearGdriveToken = async () => {
    try {
      await api.del("/admin/backup/gdrive-token");
      toast.success("GDrive token cleared");
      loadSettings();
    } catch (err: any) {
      toast.error(err?.message || "Failed to clear token");
    }
  };

  const handleTestGdrive = async () => {
    setTestingGdrive(true);
    try {
      // The backend returns HTTP 200 with a body of { status: "ok" | "error",
      // message, ... } — a failed connection check is NOT an HTTP error, so
      // we must inspect the payload rather than assume success.
      const res = await api.post<{ status: string; message?: string; account_email?: string | null }>(
        "/admin/backup/gdrive-test",
        {}
      );
      if (res.status === "ok") {
        const who = res.account_email ? ` (${res.account_email})` : "";
        toast.success(`GDrive connection successful${who}`);
      } else {
        toast.error(res.message || "GDrive test failed");
      }
    } catch (err: any) {
      toast.error(err?.message || "GDrive test failed");
    } finally {
      setTestingGdrive(false);
    }
  };

  const handleDeleteBackup = async (b: BackupFile) => {
    const confirmed = await showConfirm(
      `Delete "${b.filename}" (${formatSize(b.size_bytes)})? It will be permanently removed from the backup volume.`,
      { title: "Delete backup", confirmLabel: "Delete", danger: true }
    );
    if (!confirmed) return;
    setDeleting(b.filename);
    try {
      const res = await api.del<{ message: string; deleted: string; bytes_freed: number }>(
        `/admin/backups/${encodeURIComponent(b.filename)}`
      );
      toast.success(
        res.bytes_freed != null
          ? `Backup deleted · freed ${formatSize(res.bytes_freed)}`
          : "Backup deleted"
      );
      loadStatus();
      loadLogs(); // the deletion is logged for audit — show it immediately
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete backup");
    } finally {
      setDeleting(null);
    }
  };

  const handlePruneOld = async () => {
    if (!settings) return;
    const { count, bytes } = getPruneEligible(status, settings.retention_days);
    if (count === 0) {
      toast.success(`No backups older than ${settings.retention_days} days to prune`);
      return;
    }
    // Type-to-confirm: the admin must type the retention number, so an
    // accidental click or stray Enter can never trigger a bulk delete.
    const confirmed = await showConfirm(
      `Delete ${count} backup${count === 1 ? "" : "s"} older than ${settings.retention_days} day${settings.retention_days === 1 ? "" : "s"} (≈ ${formatSize(bytes)})? This frees space on the backup volume.`,
      {
        title: "Prune old backups",
        confirmLabel: "Prune",
        danger: true,
        requireInput: String(settings.retention_days),
      }
    );
    if (!confirmed) return;
    setPruning(true);
    try {
      const res = await api.post<{ count: number; bytes_freed: number }>("/admin/backups/prune", {});
      if (res.count > 0) {
        toast.success(
          `Pruned ${res.count} backup${res.count === 1 ? "" : "s"} · freed ${formatSize(res.bytes_freed)}`
        );
      } else {
        toast.success("No backups matched the retention cutoff");
      }
      loadStatus();
      loadLogs();
    } catch (err: any) {
      toast.error(err?.message || "Failed to prune backups");
    } finally {
      setPruning(false);
    }
  };

  const handleBackup = async () => {
    setBacking(true);
    setProgress(null);
    setShowModal(true);
    // Trigger enter animation after render
    requestAnimationFrame(() => {

    });
    try {
      const res = await api.post<{ status: string; message: string; gdrive_enabled: boolean }>(
        "/admin/backup/trigger",
        {}
      );
      toast.success(res.message);
      wasPollingRef.current = true;
      // Tolerate a few 204s (progress file not written yet / just cleared) —
      // only give up after the file stays absent for the whole timeout.
      let quietPolls = 0;
      const MAX_QUIET_POLLS = 30; // 30 × 2s = 60s before giving up
      pollRef.current = setInterval(async () => {
        try {
          const data = await api.get<BackupProgress>("/admin/backup/progress");
          quietPolls = 0;
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
              toast.error(data.step_label === "Backup failed" ? "Backup failed" : "Backup failed — see logs");
              setTimeout(closeModal, 2500);
            }
          }
        } catch {
          // 204 = no progress file (not yet written). Only abort if it stays
          // absent long enough that the backup can't possibly still be running.
          quietPolls += 1;
          if (quietPolls >= MAX_QUIET_POLLS && wasPollingRef.current) {
            stopPolling();
            setBacking(false);
            loadStatus();
            loadLogs();
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

  if (!currentUser?.is_superadmin) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-[#cbd5e1]">Access denied. Superadmin only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Backup Management</h1>
        <ListSkeleton title="Backups" cols={4} />
      </div>
    );
  }

  const currentStepIndex = progress ? getStepIndex(progress.step) : -1;
  const progressPercent = currentStepIndex >= 0 ? Math.round(((currentStepIndex + 1) / STEPS.length) * 100) : 0;
  const pruneEligible = getPruneEligible(status, settings?.retention_days ?? null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Backup Management</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRestore(true)}
            className="flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            title="Restore the database from an uploaded backup file"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Restore
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
          <button
            onClick={handlePruneOld}
            disabled={pruning || !settings}
            className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] disabled:opacity-50 transition-colors"
            title={
              pruning
                ? "Pruning…"
                : pruneEligible.count > 0
                ? `Prune ${pruneEligible.count} backup${pruneEligible.count === 1 ? "" : "s"} (${formatSize(pruneEligible.bytes)}) older than the ${settings?.retention_days ?? 30} day retention period`
                : `No backups older than the ${settings?.retention_days ?? 30} day retention period — nothing to prune`
            }
          >
            {pruning ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></div>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            Prune Old
            {!pruning && pruneEligible.count > 0 && (
              <span
                className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                title={`${pruneEligible.count} backup${pruneEligible.count === 1 ? "" : "s"} eligible (${formatSize(pruneEligible.bytes)})`}
              >
                {pruneEligible.count}
              </span>
            )}
          </button>
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
      </div>

      {/* Dashboard Cards */}
      {(() => {
        const allBackups = [...(status?.database_backups || []), ...(status?.uploads_backups || [])];
        const totalSize = allBackups.reduce((sum, b) => sum + b.size_bytes, 0);
        const lastBackup = allBackups.length > 0
          ? allBackups.reduce((latest, b) => new Date(b.created_at) > new Date(latest.created_at) ? b : latest).created_at
          : null;
        const gdriveSynced = status?.gdrive_sync?.gdrive_enabled && status?.gdrive_sync?.last_sync_status === "success";
        const gdriveConfigured = settings?.gdrive_token_set;
        const gdriveEnabled = settings?.gdrive_enabled;
        const gdriveStatus = gdriveSynced ? "Connected" : gdriveConfigured ? (gdriveEnabled ? "Configured" : "Disabled") : "Not Set";
        const gdriveStatusColor = gdriveSynced ? "text-green-600 dark:text-green-400" : gdriveConfigured ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-[#94a3b8]";
        const gdriveBgColor = gdriveSynced ? "bg-green-50 dark:bg-green-500/10" : gdriveConfigured ? "bg-amber-50 dark:bg-amber-500/10" : "bg-slate-50 dark:bg-[#282832]";
        return (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-500/10">
                  <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Total Backups</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{status?.total_backups ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-500/10">
                  <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Total Size</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{formatSize(totalSize)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-500/10">
                  <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Last Backup</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">{lastBackup ? formatDate(lastBackup) : "N/A"}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${gdriveBgColor}`}>
                  <svg className={`h-5 w-5 ${gdriveStatusColor}`} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">GDrive</p>
                  <p className={`text-lg font-bold ${gdriveStatusColor}`}>
                    {gdriveStatus}
                  </p>
                  {settings?.gdrive_account_email && (
                    <p className="text-xs text-slate-500 dark:text-[#94a3b8] mt-0.5 truncate max-w-[140px]" title={settings.gdrive_account_email}>
                      {settings.gdrive_account_email}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white p-4 dark:border-[#1a1a24] dark:bg-[#16161f] shadow-sm" title="Disk usage of the backup volume">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-50 p-2 dark:bg-purple-500/10">
                  <svg className="h-5 w-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Volume Space</p>
                  {status?.disk_usage ? (
                    <>
                      <p className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">
                        {formatSize(status.disk_usage.used)}{" "}
                        <span className="text-xs font-medium text-slate-400 dark:text-[#64748b]">of {formatSize(status.disk_usage.total)}</span>
                      </p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#282832]">
                        <div
                          className="h-full rounded-full bg-purple-500 transition-all duration-500"
                          style={{ width: `${status.disk_usage.total > 0 ? Math.round((status.disk_usage.used / status.disk_usage.total) * 100) : 0}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-[#64748b]">{formatSize(status.disk_usage.free)} free</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">N/A</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Progress Modal */}
      {showModal && (
        <Modal
          open
          onClose={() => { if (progress?.status === "done" || progress?.status === "error") closeModal(); }}
          maxWidth="md"
          panelClassName="rounded-2xl p-6"
        >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {progress?.status === "done"
                  ? "Backup Complete"
                  : progress?.status === "error"
                  ? "Backup Failed"
                  : "Backing Up..."}
              </h3>
              {(progress?.status === "done" || progress?.status === "error") && (
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
        </Modal>
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => downloadBackup(b.filename).catch((e) => toast.error(e.message))}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-[#282832] dark:hover:text-blue-400 transition-colors"
                            title="Download"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(b)}
                            disabled={deleting === b.filename}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-[#282832] dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                            title="Delete backup"
                          >
                            {deleting === b.filename ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent"></div>
                            ) : (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            )}
                          </button>
                        </div>
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => downloadBackup(b.filename).catch((e) => toast.error(e.message))}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-[#282832] dark:hover:text-blue-400 transition-colors"
                            title="Download"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(b)}
                            disabled={deleting === b.filename}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-[#282832] dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                            title="Delete backup"
                          >
                            {deleting === b.filename ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent"></div>
                            ) : (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            )}
                          </button>
                        </div>
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
                  <th className="px-4 py-2">Details</th>
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
                            : log.type === "backup_deleted" || log.type === "backup_pruned"
                            ? "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#94a3b8]"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                        }`}>
                          {log.type === "backup_completed" ? "Success" : log.type === "backup_failed" ? "Failed" : log.type === "backup_deleted" ? "Deleted" : log.type === "backup_pruned" ? "Pruned" : "Started"}
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
                      <td className={`px-4 py-2 max-w-[200px] truncate ${log.type === "backup_deleted" || log.type === "backup_pruned" ? "text-slate-500 dark:text-[#94a3b8]" : "text-red-600 dark:text-red-400"}`}>
                        {log.type === "backup_deleted" || log.type === "backup_pruned" ? (log.filename || "-") : (log.error || "-")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Restore Modal */}
      {showRestore && <RestoreBackupModal onClose={() => setShowRestore(false)} />}

      {/* Settings Modal */}
      {showSettings && (
        <Modal open onClose={() => setShowSettings(false)} maxWidth="lg" panelClassName="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">Backup Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#282832]"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-[#1a1a24]">
              <button
                onClick={() => setSettingsTab("schedule")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  settingsTab === "schedule"
                    ? "border-brand-600 dark:border-blue-500 text-brand-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 dark:text-[#94a3b8] hover:text-slate-700 dark:hover:text-[#cbd5e1]"
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setSettingsTab("gdrive")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  settingsTab === "gdrive"
                    ? "border-brand-600 dark:border-blue-500 text-brand-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 dark:text-[#94a3b8] hover:text-slate-700 dark:hover:text-[#cbd5e1]"
                }`}
              >
                Google Drive
              </button>
            </div>

            {/* Schedule Tab */}
            {settingsTab === "schedule" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1] mb-1">
                    Backup Interval (hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={settings?.backup_interval_hours ?? 24}
                    onChange={(e) => setSettings(settings ? { ...settings, backup_interval_hours: Number(e.target.value) } : null)}
                    className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-brand-600 dark:focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1] mb-1">
                    Retention (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={settings?.retention_days ?? 30}
                    onChange={(e) => setSettings(settings ? { ...settings, retention_days: Number(e.target.value) } : null)}
                    className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-brand-600 dark:focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveSettings}
                    className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* GDrive Tab */}
            {settingsTab === "gdrive" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Status</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    settings?.gdrive_token_set
                      ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                      : "bg-slate-50 text-slate-500 dark:bg-[#282832] dark:text-[#94a3b8]"
                  }`}>
                    {settings?.gdrive_token_set ? "Token Set" : "No Token"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">GDrive Sync</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings?.gdrive_enabled ?? false}
                      onChange={(e) => setSettings(settings ? { ...settings, gdrive_enabled: e.target.checked } : null)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 dark:bg-[#282832] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600 dark:peer-checked:bg-blue-500"></div>
                  </label>
                </div>

                {/* Step-by-step guide */}
                <details className="rounded-lg border border-slate-200 dark:border-[#282832]">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-[#1a1a24] rounded-lg transition-colors">
                    How to get a GDrive token?
                  </summary>
                  <div className="px-3 pb-3 pt-1 space-y-2 text-xs text-slate-600 dark:text-[#94a3b8]">
                    <p><strong>Step 1:</strong> Install rclone on your local machine:</p>
                    <pre className="rounded bg-slate-100 dark:bg-[#0f0f16] px-3 py-2 font-mono text-[11px] overflow-x-auto">curl https://rclone.org/install.sh | sudo bash</pre>
                    <p className="pt-1"><strong>Step 2:</strong> Run the authorize command:</p>
                    <pre className="rounded bg-slate-100 dark:bg-[#0f0f16] px-3 py-2 font-mono text-[11px] overflow-x-auto">rclone authorize drive</pre>
                    <p className="pt-1"><strong>Step 3:</strong> Your browser will open a Google sign-in page. Log in and grant access.</p>
                    <p><strong>Step 4:</strong> After authorizing, rclone will output a long JSON token. Copy the <strong>entire token</strong> (starts with <code className="text-[10px]">{'{"access_token":"'}</code>) and paste it below.</p>
                    <div className="mt-2 rounded bg-amber-50 dark:bg-amber-500/5 px-3 py-2 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                      <strong>Tip:</strong> Run this on your local machine (not the server). If you don't have rclone, use <strong>Windows (exe)</strong>, <strong>macOS (brew)</strong>, or <strong>Linux (apt)</strong> — rclone works on all platforms.
                    </div>
                  </div>
                </details>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1] mb-1">
                    Paste Token
                  </label>
                  <textarea
                    rows={3}
                    value={gdriveToken}
                    onChange={(e) => setGdriveToken(e.target.value)}
                    placeholder="Paste your GDrive OAuth token here..."
                    className="w-full rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-brand-600 dark:focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSaveGdriveToken}
                    disabled={!gdriveToken.trim()}
                    className="rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    Save Token
                  </button>
                  <button
                    onClick={handleClearGdriveToken}
                    disabled={!settings?.gdrive_token_set}
                    className="rounded-lg border border-red-300 dark:border-red-500/30 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                  >
                    Clear Token
                  </button>
                  <button
                    onClick={handleTestGdrive}
                    disabled={testingGdrive || !settings?.gdrive_token_set}
                    className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] disabled:opacity-50 transition-colors"
                  >
                    {testingGdrive ? (
                      <>
                        <div className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent mr-1.5"></div>
                        Testing...
                      </>
                    ) : (
                      "Test Connection"
                    )}
                  </button>
                </div>
              </div>
            )}
        </Modal>
      )}
    </div>
  );
}
