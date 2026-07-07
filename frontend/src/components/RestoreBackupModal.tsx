import { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { useAuthStore } from "../store/auth";

interface Props {
  onClose: () => void;
}

type Step = "upload" | "verify" | "confirm" | "restoring" | "done";

interface UploadResult {
  database_file: string;
  uploads_file: string | null;
  database_size: number;
  uploads_size: number | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RestoreBackupModal({ onClose }: Props) {
  const toast = useToastStore();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const [step, setStep] = useState<Step>("upload");
  const [dbFile, setDbFile] = useState<File | null>(null);
  const [upFile, setUpFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");

  const dbInputRef = useRef<HTMLInputElement>(null);
  const upInputRef = useRef<HTMLInputElement>(null);

  const handleDbChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setDbFile(file);
    setError("");
    if (file && !file.name.endsWith(".sql.gz")) {
      setError("Database backup must be a .sql.gz file");
      setDbFile(null);
      e.target.value = "";
    }
  }, []);

  const handleUpChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUpFile(file);
    setError("");
    if (file && !file.name.endsWith(".tar.gz")) {
      setError("Uploads backup must be a .tar.gz file");
      setUpFile(null);
      e.target.value = "";
    }
  }, []);

  const handleUpload = async () => {
    if (!dbFile) return;
    setStep("verify");
    setError("");
    try {
      const form = new FormData();
      form.append("database_file", dbFile);
      if (upFile) form.append("uploads_file", upFile);
      const res = await api.post<UploadResult>("/admin/restore/upload", form);
      setUploadResult(res);
      setStep("confirm");
    } catch (err: any) {
      setError(err?.message || "Upload failed");
      setStep("upload");
    }
  };

  const handleRestore = async () => {
    if (confirmText !== "RESTORE") return;
    setStep("restoring");
    setError("");
    try {
      await api.post("/admin/restore/execute", {
        database_file: uploadResult!.database_file,
        uploads_file: uploadResult!.uploads_file,
        confirm: "RESTORE",
      });
      setStep("done");
      toast.success("Restore complete. You will be redirected to login.");
      setTimeout(() => {
        logout();
        navigate("/login");
      }, 3000);
    } catch (err: any) {
      setError(err?.message || "Restore failed");
      setStep("confirm");
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white dark:bg-[#16161f] shadow-2xl border border-slate-200 dark:border-[#1a1a24]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">Restore from Backup</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-[#cbd5e1]">
              Upload a database backup to restore your data
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#282832]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Step: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Database backup */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                  Database backup *
                </label>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-[#8b8b9e]">
                  The .sql.gz file from your backup
                </p>
                <div className="mt-2">
                  <input
                    ref={dbInputRef}
                    type="file"
                    accept=".sql.gz"
                    className="hidden"
                    onChange={handleDbChange}
                  />
                  {dbFile ? (
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-[#1a1a24] px-4 py-3">
                      <svg className="h-5 w-5 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{dbFile.name}</p>
                        <p className="text-xs text-slate-500 dark:text-[#8b8b9e]">{formatSize(dbFile.size)}</p>
                      </div>
                      <button onClick={() => { setDbFile(null); dbInputRef.current!.value = ""; }}
                        className="text-xs text-slate-500 hover:text-red-600 dark:text-[#8b8b9e] dark:hover:text-red-400">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => dbInputRef.current?.click()}
                      className="w-full rounded-lg border-2 border-dashed border-slate-300 dark:border-[#282832] px-4 py-6 text-center hover:border-brand-600 hover:bg-brand-50 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10">
                      <svg className="mx-auto h-8 w-8 text-slate-400 dark:text-[#8b8b9e]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <p className="mt-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">
                        Click to select database backup
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-[#8b8b9e]">.sql.gz files only</p>
                    </button>
                  )}
                </div>
              </div>

              {/* Uploads backup */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                  Uploads backup
                </label>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-[#8b8b9e]">
                  Optional — logos and attachments (.tar.gz)
                </p>
                <div className="mt-2">
                  <input
                    ref={upInputRef}
                    type="file"
                    accept=".tar.gz"
                    className="hidden"
                    onChange={handleUpChange}
                  />
                  {upFile ? (
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-[#1a1a24] px-4 py-3">
                      <svg className="h-5 w-5 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{upFile.name}</p>
                        <p className="text-xs text-slate-500 dark:text-[#8b8b9e]">{formatSize(upFile.size)}</p>
                      </div>
                      <button onClick={() => { setUpFile(null); upInputRef.current!.value = ""; }}
                        className="text-xs text-slate-500 hover:text-red-600 dark:text-[#8b8b9e] dark:hover:text-red-400">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => upInputRef.current?.click()}
                      className="w-full rounded-lg border-2 border-dashed border-slate-300 dark:border-[#282832] px-4 py-4 text-center hover:border-brand-600 hover:bg-brand-50 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10">
                      <p className="text-sm font-medium text-slate-600 dark:text-[#cbd5e1]">
                        Click to select uploads backup (optional)
                      </p>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step: Verifying */}
          {step === "verify" && (
            <div className="flex flex-col items-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent"></div>
              <p className="mt-4 text-sm text-slate-600 dark:text-[#cbd5e1]">Verifying backup files...</p>
            </div>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && uploadResult && (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 dark:bg-amber-500/10 dark:border-amber-500/20">
                <div className="flex gap-2">
                  <svg className="h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    <p className="font-medium">This will overwrite all existing data</p>
                    <p className="mt-1">The database will be dropped and replaced with the backup. This cannot be undone.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] px-4 py-3">
                <h4 className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">Backup details</h4>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-[#8b8b9e]">Database file</dt>
                    <dd className="font-medium text-slate-900 dark:text-[#f1f5f9]">{uploadResult.database_file}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-[#8b8b9e]">Database size</dt>
                    <dd className="font-medium text-slate-900 dark:text-[#f1f5f9]">{formatSize(uploadResult.database_size)}</dd>
                  </div>
                  {uploadResult.uploads_file && (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-[#8b8b9e]">Uploads file</dt>
                        <dd className="font-medium text-slate-900 dark:text-[#f1f5f9]">{uploadResult.uploads_file}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-[#8b8b9e]">Uploads size</dt>
                        <dd className="font-medium text-slate-900 dark:text-[#f1f5f9]">{formatSize(uploadResult.uploads_size!)}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">
                  Type <span className="font-mono font-bold">RESTORE</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="RESTORE"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600 dark:border-[#282832] dark:focus:border-red-500/50 dark:focus:ring-red-500/20"
                />
              </div>
            </div>
          )}

          {/* Step: Restoring */}
          {step === "restoring" && (
            <div className="flex flex-col items-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent"></div>
              <p className="mt-4 text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">Restoring backup...</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#8b8b9e]">The API will restart shortly. You will be redirected to login.</p>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/10">
                <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="mt-4 text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">Restore complete!</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#8b8b9e]">Redirecting to login...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "upload" && (
          <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-[#1a1a24] px-5 py-4">
            <button onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
              Cancel
            </button>
            <button onClick={handleUpload} disabled={!dbFile}
              className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50">
              Upload &amp; Verify
            </button>
          </div>
        )}

        {step === "confirm" && (
          <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-[#1a1a24] px-5 py-4">
            <button onClick={() => { setStep("upload"); setConfirmText(""); }}
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
              Back
            </button>
            <button onClick={handleRestore} disabled={confirmText !== "RESTORE"}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              Restore
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
