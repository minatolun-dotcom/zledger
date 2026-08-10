import { useEffect, useState, useMemo } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import DateInput from "../components/DateInput";
import SortableTable from "../components/SortableTable";
import TableKeyboardHint from "../components/TableKeyboardHint";
import type { SortableColumn } from "../components/SortableTable";
import { toDisplayDate } from "../utils/dateUtils";
import { ListSkeleton } from "./skeletons";
import Modal from "../components/Modal";


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

interface AuditLogPaginated {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
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
  user_id: string;
  user_email: string;
  user_name: string | null;
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

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return toDisplayDate(iso.split("T")[0]);
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
  const toast = useToastStore();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLogDetail | null>(null);

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  const refresh = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (entityFilter) params.set("entity_type", entityFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (userIdFilter) params.set("user_id", userIdFilter);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    if (searchText) params.set("search", searchText);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));

    api.get<AuditLogPaginated>(`/audit?${params.toString()}`)
      .then((data) => { setLogs(data.items); setTotal(data.total); })
      .catch((err) => toast.error(err?.message || "Failed to load audit logs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(0); }, [entityFilter, actionFilter, userIdFilter, fromDate, toDate, searchText]);
  useEffect(() => { refresh(); }, [entityFilter, actionFilter, userIdFilter, fromDate, toDate, searchText, page]);

  // Load users for the user filter dropdown
  useEffect(() => {
    api.get<UserOption[]>("/members").then(setUsers).catch(() => {});
  }, []);

  const viewDetail = async (id: string) => {
    try {
      const detail = await api.get<AuditLogDetail>(`/audit/${id}`);
      setSelectedLog(detail);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load detail");
    }
  };

  const hasActiveFilters = entityFilter || actionFilter || userIdFilter || fromDate || toDate || searchText;



  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Audit Log</h1>
        <span className="text-xs text-slate-500 dark:text-[#cbd5e1]">
          {total} {total === 1 ? "entry" : "entries"} {total > PAGE_SIZE && `(page ${page + 1} of ${Math.ceil(total / PAGE_SIZE)})`}
        </span>
      </div>

      {/* Filters */}
      <div className="mt-4 space-y-3">
        {/* Row 1: Dropdowns */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[160px]">
            <Select
              label="Entity Type"
              value={entityFilter}
              onChange={(v) => setEntityFilter(v)}
              options={ENTITY_FILTER_OPTIONS}
              placeholder="All"
            />
          </div>
          <div className="min-w-[140px]">
            <Select
              label="Action"
              value={actionFilter}
              onChange={(v) => setActionFilter(v)}
              options={ACTION_FILTER_OPTIONS}
              placeholder="All"
            />
          </div>
          <div className="min-w-[180px]">
            <Select
              label="User"
              value={userIdFilter}
              onChange={(v) => setUserIdFilter(v)}
              options={[
                { value: "", label: "All Users" },
                ...users.map((u) => ({ value: u.user_id, label: u.user_name || u.user_email })),
              ]}
            />
          </div>
        </div>

        {/* Row 2: Date range + search */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">From Date</label>
            <DateInput value={fromDate} onChange={setFromDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">To Date</label>
            <DateInput value={toDate} onChange={setToDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Search Description</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="e.g. Cancelled voucher..."
              className="rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#1a1a24] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20 w-56"
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
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <ListSkeleton title="Audit Log" cols={5} />
      ) : (
        <div className="mt-4">
          <AuditLogSortableTable logs={logs} onRowClick={viewDetail} />
          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-[#1a1a24] px-4 py-3">
              <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-600 dark:text-[#cbd5e1]">
                  Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(Math.ceil(total / PAGE_SIZE) - 1, p + 1))}
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  className="rounded border border-slate-300 dark:border-[#282832] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
      <Modal open onClose={() => setSelectedLog(null)} maxWidth="2xl" panelClassName="max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Audit Log Detail</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 dark:text-[#64748b] hover:text-slate-600 dark:hover:text-[#e2e8f0]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 dark:bg-[#282832] p-3 text-xs text-slate-700 dark:text-[#cbd5e1]">
                    {JSON.stringify(selectedLog.old_value, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_value && (
                <div>
                  <span className="font-medium text-slate-700 dark:text-[#cbd5e1]">New State:</span>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 dark:bg-[#282832] p-3 text-xs text-slate-700 dark:text-[#cbd5e1]">
                    {JSON.stringify(selectedLog.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
              >
                Close
              </button>
            </div>
      </Modal>
      )}
    </div>
  );
}

function AuditLogSortableTable({
  logs,
  onRowClick,
}: {
  logs: AuditLogEntry[];
  onRowClick: (id: string) => void;
}) {
  const columns: SortableColumn<AuditLogEntry>[] = useMemo(
    () => [
      {
        id: "created_at",
        header: "Date",
        accessorKey: "created_at",
        size: 140,
        cell: ({ getValue }) => formatDate(getValue()),
        className: "text-slate-600 dark:text-[#cbd5e1]",
      },
      {
        id: "action",
        header: "Action",
        accessorKey: "action",
        size: 100,
        cell: ({ getValue }) => {
          const action = getValue();
          return (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[action] || "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]"}`}>
              {action}
            </span>
          );
        },
      },
      {
        id: "entity_type",
        header: "Entity",
        accessorKey: "entity_type",
        size: 120,
        cell: ({ getValue }) => {
          const type = getValue();
          return <span className="font-medium">{ENTITY_LABELS[type] || type}</span>;
        },
      },
      {
        id: "description",
        header: "Description",
        accessorKey: "description",
        size: 300,
        cell: ({ getValue }) => (
          <span className="max-w-xs truncate block">{getValue() || "—"}</span>
        ),
        className: "text-slate-600 dark:text-[#cbd5e1]",
      },
      {
        id: "user_name",
        header: "User",
        accessorKey: "user_name",
        size: 150,
        cell: ({ row }) => {
          const log = row.original;
          return log.user_name || log.user_email || "System";
        },
        className: "text-slate-600 dark:text-[#cbd5e1]",
      },
    ],
    []
  );

  return (
    <>
      <TableKeyboardHint className="mb-3" />
      <SortableTable
        data={logs}
        columns={columns}
        tableKey="audit-log"
        initialSorting={[{ id: "created_at", desc: true }]}
        onRowClick={(log) => onRowClick(log.id)}
        emptyMessage="No audit log entries found."
        keyboardNav
      />
    </>
  );
}
