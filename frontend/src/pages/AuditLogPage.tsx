import { useEffect, useState } from "react";
import { api } from "../api/client";
import { toDisplayDate } from "../utils/dateUtils";

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

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700",
  UPDATE: "bg-amber-50 text-amber-700",
  DELETE: "bg-red-50 text-red-700",
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

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const refresh = () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (entityFilter) params.set("entity_type", entityFilter);
    if (actionFilter) params.set("action", actionFilter);
    params.set("limit", "200");

    api.get<AuditLogEntry[]>(`/audit?${params.toString()}`)
      .then(setLogs)
      .catch((err) => setError(err?.detail || "Failed to load audit logs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, [entityFilter, actionFilter]);

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

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h2 className="text-lg font-bold text-slate-900">Audit Log</h2>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Entity Type</label>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="voucher">Voucher</option>
            <option value="member">Member</option>
            <option value="ledger">Ledger</option>
            <option value="company">Company</option>
            <option value="gst_registration">GST Registration</option>
            <option value="hsn_sac">HSN/SAC</option>
            <option value="financial_year">Financial Year</option>
            <option value="party">Party</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
          </select>
        </div>
        <button
          onClick={() => { setEntityFilter(""); setActionFilter(""); }}
          className="mt-5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Clear Filters
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
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
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 text-slate-600">{formatDate(log.created_at)}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[log.action] || "bg-slate-100 text-slate-600"}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 font-medium">{ENTITY_LABELS[log.entity_type] || log.entity_type}</td>
                  <td className="py-2 text-slate-600 max-w-xs truncate">{log.description || "—"}</td>
                  <td className="py-2 text-slate-600">{log.user_name || log.user_email || "System"}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => viewDetail(log.id)}
                      disabled={detailLoading}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">No audit log entries found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Audit Log Detail</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="font-medium text-slate-700">Action:</span> {selectedLog.action}</div>
                <div><span className="font-medium text-slate-700">Entity:</span> {ENTITY_LABELS[selectedLog.entity_type] || selectedLog.entity_type}</div>
                <div><span className="font-medium text-slate-700">User:</span> {selectedLog.user_name || selectedLog.user_email || "System"}</div>
                <div><span className="font-medium text-slate-700">Date:</span> {formatDate(selectedLog.created_at)}</div>
                {selectedLog.entity_id && (
                  <div className="col-span-2"><span className="font-medium text-slate-700">Entity ID:</span> <code className="text-xs">{selectedLog.entity_id}</code></div>
                )}
                {selectedLog.description && (
                  <div className="col-span-2"><span className="font-medium text-slate-700">Description:</span> {selectedLog.description}</div>
                )}
              </div>

              {selectedLog.old_value && (
                <div>
                  <span className="font-medium text-slate-700">Previous State:</span>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {JSON.stringify(selectedLog.old_value, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_value && (
                <div>
                  <span className="font-medium text-slate-700">New State:</span>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {JSON.stringify(selectedLog.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
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
