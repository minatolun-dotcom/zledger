import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import DateInput from "../components/DateInput";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import useEscapeToClose from "../hooks/useEscapeToClose";
import SortableTable, { type SortableColumn } from "../components/SortableTable";

interface RecurringTemplate {
  id: string;
  name: string;
  voucher_type: string;
  frequency: string;
  next_run_date: string;
  last_run_date: string | null;
  is_active: boolean;
  template_payload: any;
  created_at: string | null;
}

const VOUCHER_TYPE_OPTIONS = [
  { value: "sales", label: "Sales" },
  { value: "purchase", label: "Purchase" },
  { value: "payment", label: "Payment" },
  { value: "receipt", label: "Receipt" },
  { value: "journal", label: "Journal" },
  { value: "credit_note", label: "Credit Note" },
  { value: "debit_note", label: "Debit Note" },
  { value: "contra", label: "Contra" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const TYPE_COLOR: Record<string, string> = {
  sales: "text-emerald-600 dark:text-emerald-400",
  purchase: "text-blue-600 dark:text-blue-400",
  payment: "text-rose-600 dark:text-rose-400",
  receipt: "text-blue-600 dark:text-blue-400",
  journal: "text-amber-600 dark:text-amber-400",
  credit_note: "text-orange-600 dark:text-orange-400",
  debit_note: "text-cyan-600 dark:text-cyan-400",
  contra: "text-slate-500 dark:text-[#cbd5e1]",
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0 && diffDays <= 30) return `in ${diffDays} days`;
  if (diffDays < 0 && diffDays >= -30) return `${Math.abs(diffDays)} days ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatRelativeDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function RecurringTemplatesPage() {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToastStore();
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    voucher_type: "sales",
    frequency: "monthly",
    next_run_date: new Date().toISOString().split("T")[0],
    template_payload: {},
  });

  const refresh = () => {
    setLoading(true);
    api.get<RecurringTemplate[]>("/recurring-templates")
      .then(setTemplates)
      .catch((err) => toast.error(err?.message || "Failed to load templates"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  useEscapeToClose(showForm, () => { setShowForm(false); setEditingId(null); });

  const runIcon = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l7.2 3.6c.75.375 1.125 1.289.75 2.118l-7.2 3.6c-.75.375-1.5-.165-1.5-.986V5.653z" />
    </svg>
  );
  const editIcon = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
  const deleteIcon = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );

  const cols: SortableColumn<RecurringTemplate>[] = [
    { id: "name", header: "Template", size: 300, cell: ({ row: { original: t } }) => (
      <>
        <div className="font-medium">{t.name}</div>
        <div className="text-xs text-slate-400 dark:text-[#64748b]">
          <span className={TYPE_COLOR[t.voucher_type] || ""}>{t.voucher_type.replace("_", " ")}</span>
          <span className="mx-1">·</span>
          <span>{t.frequency}</span>
        </div>
      </>
    )},
    { id: "next_run", header: "Next Run", size: 150, cell: ({ row: { original: t } }) => (
      <span className={`text-sm ${new Date(t.next_run_date + "T00:00:00") < new Date() ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-[#cbd5e1]"}`}>
        {formatRelativeDate(t.next_run_date)}
      </span>
    )},
    { id: "last_run", header: "Last Run", size: 150, cell: ({ row: { original: t } }) => (
      <span className="text-slate-600 dark:text-[#cbd5e1]">{formatRelativeDateTime(t.last_run_date)}</span>
    )},
    { id: "status", header: "Status", size: 120, cell: ({ row: { original: t } }) => (
      <button
        onClick={() => handleToggleActive(t)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition-colors hover:opacity-80 ${
          t.is_active
            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "bg-slate-100 dark:bg-[#282832] text-slate-500 dark:text-[#64748b]"
        }`}
        title={t.is_active ? "Click to pause" : "Click to resume"}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${t.is_active ? "bg-emerald-500" : "bg-slate-400 dark:bg-[#64748b]"}`} />
        {t.is_active ? "Active" : "Paused"}
      </button>
    )},
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/recurring-templates/${editingId}`, form);
      } else {
        await api.post("/recurring-templates", form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: "", voucher_type: "sales", frequency: "monthly", next_run_date: new Date().toISOString().split("T")[0], template_payload: {} });
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save template");
    }
  };

  const handleEdit = (t: RecurringTemplate) => {
    setForm({
      name: t.name,
      voucher_type: t.voucher_type,
      frequency: t.frequency,
      next_run_date: t.next_run_date,
      template_payload: t.template_payload,
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!await showConfirm("Delete this template?", { danger: true, confirmLabel: "Delete" })) return;
    try {
      await api.del(`/recurring-templates/${id}`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await api.post(`/recurring-templates/${id}/run`);
      toast.success("Template executed successfully");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to run template");
    }
  };

  const handleToggleActive = async (t: RecurringTemplate) => {
    try {
      await api.patch(`/recurring-templates/${t.id}`, {
        ...t,
        is_active: !t.is_active,
      });
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update");
    }
  };

  const filtered = templates.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.voucher_type.toLowerCase().includes(q) || t.frequency.toLowerCase().includes(q);
  });


  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Recurring Templates</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: "", voucher_type: "sales", frequency: "monthly", next_run_date: new Date().toISOString().split("T")[0], template_payload: {} }); }}
          className="rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600"
        >
          {showForm ? "Cancel" : "+ New Template"}
        </button>
      </div>
      {!loading && <p className="text-sm text-slate-500 dark:text-[#64748b] mb-6">{templates.length} templates</p>}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); } }}>
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#16161f] p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingId ? "Edit Template" : "New Template"}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] text-lg leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16]"
                    placeholder="e.g. Monthly Rent" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Voucher Type</label>
                  <Select value={form.voucher_type} onChange={(v) => setForm({ ...form, voucher_type: v })} options={VOUCHER_TYPE_OPTIONS} className="mt-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Frequency</label>
                  <Select value={form.frequency} onChange={(v) => setForm({ ...form, frequency: v })} options={FREQUENCY_OPTIONS} className="mt-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Next Run Date</label>
                  <DateInput value={form.next_run_date} onChange={(v) => setForm({ ...form, next_run_date: v })}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16]" required />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600">
                  {editingId ? "Update Template" : "Create Template"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search + Table */}
      {loading ? (
        <ListSkeleton title="Recurring Templates" cols={4} />
      ) : (
        <div className="mt-4">
          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
            <SortableTable
              columns={cols}
              data={filtered}
              tableKey="recurring-templates"
              emptyMessage="No recurring templates yet."
              actions={(t) => [
                { icon: runIcon, label: "Run now", onClick: () => handleRunNow(t.id) },
                { icon: editIcon, label: "Edit", onClick: () => handleEdit(t) },
                { icon: <span />, label: t.is_active ? "Pause" : "Resume", onClick: () => handleToggleActive(t) },
                { icon: deleteIcon, label: "Delete", danger: true, onClick: () => handleDelete(t.id) },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
