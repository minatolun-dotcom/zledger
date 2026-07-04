import { useEffect, useState } from "react";
import { api } from "../api/client";
import Select from "../components/Select";
import { toDisplayDate } from "../utils/dateUtils";
import { ListSkeleton } from "./skeletons";

interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  user_email: string | null;
  user_name: string | null;
  created_at: string | null;
}

interface AuditLogDetail extends AuditLogEntry {
  company_id: string;
  user_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
}

interface UserOption {
  id: string;
  email: string;
  name: string | null;
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  UPDATE: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  DELETE: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  CANCEL: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
};

const ENTITY_LABELS: Record<string, string> = {
  voucher: "Voucher",
  ledger: "Ledger",
  member: "Member",
  company: "Company",
  gst_registration: "GST Registration",
  hsn_sac: "HSN/SAC",
  financial_year: "Financial Year",
  party: "Party",
  e_invoice: "E-Invoice",
};

const ENTITY_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "voucher", label: "Voucher" },
  { value: "member", label: "Member" },
  { value: "ledger", label: "Ledger" },
  { value: "company", label: "Company" },
  { value: "gst_registration", label: "GST Registration" },
  { value: "hsn_sac", label: "HSN/SAC" },
  { value: "financial_year", label: "Financial Year" },
  { value: "party", label: "Party" },
];

const ACTION_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "CANCEL", label: "Cancel" },
];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);

  const refresh = () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (entityFilter) params.set("entity_type", entityFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (userIdFilter) params.set("user_id", userIdFilter);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    if (searchText) params.set("search", searchText);
    params.set("limit", "200");

    api.get<AuditLogEntry[]>(`/audit?${params.toString()}`)
      .then(setLogs)
      .catch((err) => setError(err?.detail || "Failed to load audit logs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, [entityFilter, actionFilter, userIdFilter, fromDate, toDate, searchText]);

  // Load users for the user filter dropdown
  useEffect(() => {
    api.get<UserOption[]>("/members").then(setUsers).catch(() => {});
  }, []);

  const viewDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.get<AuditLogDetail>(`/audit/${id}`);
      setSelectedLog(detail);
    } catch (err: any) {
      setError(err?.detail || "Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return toDisplayDate(iso.split("T")[0]);
  };

  const hasActiveFilters = entityFilter || actionFilter || userIdFilter || fromDate || toDate || searchText;

  useEffect(() => {
    if (!selectedLog) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedLog(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedLog]);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Audit Log</h2>
        <span className="text-xs text-slate-500 dark:text-[#94a3b8]">
          {logs.length} {logs.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Filters */}
      <div className="mt-4 space-y-3">
        {/* Row 1: Dropdowns */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Select
              label="Entity Type"
              value={entityFilter}
              onChange={(v) => setEntityFilter(v)}
              options={ENTITY_FILTER_OPTIONS}
              placeholder="All"
              className="block rounded-lg"
            />
          </div>
          <div>
            <Select
              label="Action"
              value={actionFilter}
              onChange={(v) => setActionFilter(v)}
              options={ACTION_FILTER_OPTIONS}
              placeholder="All"
              className="block rounded-lg"
            />
          </div>
          <div>
            <Select
              label="User"
              value={userIdFilter}
              onChange={(v) => setUserIdFilter(v)}
              options={[
                { value: "", label: "All Users" },
                ...users.map((u) => ({ value: u.id, label: u.name || u.email })),
              ]}
              placeholder="All Users"
              className="block rounded-lg"
            />
          </div>
        </div>

        {/* Row 2: Date range + search */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#1e1e28] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#1e1e28] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Search Description</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="e.g. Cancelled voucher..."
              className="rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#1e1e28] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-violet-500/20 w-56"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setEntityFilter("");
                setActionFilter("");
                setUserIdFilter("");
                setFromDate("");
                setToDate("");
                setSearchText("");
              }}
              className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <ListSkeleton title="Audit Log" cols={5} />
      ) : (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Date</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Entity</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">User</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 dark:border-[#1e1e28] hover:bg-slate-50 dark:hover:bg-[#1e1e28]">
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{formatDate(log.created_at)}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[log.action] || "bg-slate-100 text-slate-600 dark:bg-[#252530] dark:text-[#94a3b8]"}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 font-medium">{ENTITY_LABELS[log.entity_type] || log.entity_type}</td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8] max-w-xs truncate">{log.description || "—"}</td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{log.user_name || log.user_email || "System"}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => viewDetail(log.id)}
                      disabled={detailLoading}
                      className="text-xs text-brand-600 dark:text-violet-400 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No audit log entries found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setSelectedLog(null); }}>
          <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white dark:bg-[#18181f] p-6 shadow-xl dark:shadow-dark-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Audit Log Detail</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#e2e8f0]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="font-medium text-slate-700 dark:text-[#cbd5e1]">Action:</span> {selectedLog.action}</div>
                <div><span className="font-medium text-slate-700 dark:text-[#cbd5e1]">Entity:</span> {ENTITY_LABELS[selectedLog.entity_type] || selectedLog.entity_type}</div>
                <div><span className="font-medium text-slate-700 dark:text-[#cbd5e1]">User:</span> {selectedLog.user_name || selectedLog.user_email || "System"}</div>
                <div><span className="font-medium text-slate-700 dark:text-[#cbd5e1]">Date:</span> {formatDate(selectedLog.created_at)}</div>
                {selectedLog.entity_id && (
                  <div className="col-span-2"><span className="font-medium text-slate-700 dark:text-[#cbd5e1]">Entity ID:</span> <code className="text-xs">{selectedLog.entity_id}</code></div>
                )}
                {selectedLog.description && (
                  <div className="col-span-2"><span className="font-medium text-slate-700 dark:text-[#cbd5e1]">Description:</span> {selectedLog.description}</div>
                )}
              </div>

              {selectedLog.old_value && (
                <div>
                  <span className="font-medium text-slate-700 dark:text-[#cbd5e1]">Previous State:</span>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 dark:bg-[#252530] p-3 text-xs text-slate-700 dark:text-[#cbd5e1]">
                    {JSON.stringify(selectedLog.old_value, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_value && (
                <div>
                  <span className="font-medium text-slate-700 dark:text-[#cbd5e1]">New State:</span>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 dark:bg-[#252530] p-3 text-xs text-slate-700 dark:text-[#cbd5e1]">
                    {JSON.stringify(selectedLog.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]"
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
