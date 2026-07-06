import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import ContextMenu from "../components/ContextMenu";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";

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
  contra: "text-slate-500 dark:text-[#94a3b8]",
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

  const [menuState, setMenuState] = useState<{ templateId: string; x: number; y: number } | null>(null);

  const refresh = () => {
    setLoading(true);
    api.get<RecurringTemplate[]>("/recurring-templates")
      .then(setTemplates)
      .catch((err) => toast.error(err?.message || "Failed to load templates"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    const handler = () => setMenuState(null);
    if (menuState) {
      document.addEventListener("click", handler);
      document.addEventListener("scroll", handler, true);
      return () => { document.removeEventListener("click", handler); document.removeEventListener("scroll", handler, true); };
    }
  }, [menuState]);

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

  const openMenu = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    setMenuState({ templateId, x: e.clientX, y: e.clientY });
  };

  const getMenuItems = (t: RecurringTemplate) => [
    { label: "Run now", onClick: () => handleRunNow(t.id) },
    { label: "Edit", onClick: () => handleEdit(t) },
    { label: t.is_active ? "Pause" : "Resume", onClick: () => handleToggleActive(t) },
    { label: "Delete", onClick: () => handleDelete(t.id), danger: true },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Recurring Templates</h2>
          {!loading && (
            <span className="text-xs text-slate-400 dark:text-[#64748b]">{templates.length} templates</span>
          )}
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: "", voucher_type: "sales", frequency: "monthly", next_run_date: new Date().toISOString().split("T")[0], template_payload: {} }); }}
          className="rounded-lg bg-brand-600 dark:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600"
        >
          {showForm ? "Cancel" : "+ New Template"}
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]"
                placeholder="e.g. Monthly Rent" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Voucher Type</label>
              <Select value={form.voucher_type} onChange={(v) => setForm({ ...form, voucher_type: v })} options={VOUCHER_TYPE_OPTIONS} className="mt-1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Frequency</label>
              <Select value={form.frequency} onChange={(v) => setForm({ ...form, frequency: v })} options={FREQUENCY_OPTIONS} className="mt-1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Next Run Date</label>
              <input type="date" value={form.next_run_date} onChange={(e) => setForm({ ...form, next_run_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm bg-white dark:bg-[#111118]" required />
            </div>
          </div>
          <button type="submit"
            className="rounded-lg bg-brand-600 dark:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-blue-600">
            {editingId ? "Update Template" : "Create Template"}
          </button>
        </form>
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
              className="w-full max-w-xs rounded-lg border border-slate-200 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-1.5 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#1e1e28]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-[#252530] bg-slate-50 dark:bg-[#18181f]/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8]">
                <th className="px-3 py-2.5">Template</th>
                <th className="px-3 py-2.5">Next Run</th>
                <th className="px-3 py-2.5">Last Run</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 dark:border-[#1e1e28]">
                  <td className="py-2">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-slate-400 dark:text-[#64748b]">
                      <span className={TYPE_COLOR[t.voucher_type] || ""}>{t.voucher_type.replace("_", " ")}</span>
                      <span className="mx-1">·</span>
                      <span>{t.frequency}</span>
                    </div>
                  </td>
                  <td className="py-2">
                    <span className={`text-sm ${new Date(t.next_run_date + "T00:00:00") < new Date() ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-[#94a3b8]"}`}>
                      {formatRelativeDate(t.next_run_date)}
                    </span>
                  </td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">
                    {formatRelativeDateTime(t.last_run_date)}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => handleToggleActive(t)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition-colors hover:opacity-80 ${
                        t.is_active
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-slate-100 dark:bg-[#252530] text-slate-500 dark:text-[#64748b]"
                      }`}
                      title={t.is_active ? "Click to pause" : "Click to resume"}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${t.is_active ? "bg-emerald-500" : "bg-slate-400 dark:bg-[#64748b]"}`} />
                      {t.is_active ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="py-2">
                    <div className="relative flex justify-end">
                      <button
                        onClick={(e) => openMenu(e, t.id)}
                        className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#1e1e28] transition-colors"
                        title="Actions"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <circle cx="12" cy="5" r="1" />
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="12" cy="19" r="1" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && templates.length > 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center">
                    <p className="text-sm text-slate-500 dark:text-[#94a3b8]">No templates match "{search}"</p>
                    <button onClick={() => setSearch("")} className="mt-1 text-xs text-brand-600 dark:text-blue-400 hover:underline">Clear search</button>
                  </td>
                </tr>
              )}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="mt-2 text-sm text-slate-500 dark:text-[#94a3b8]">No recurring templates yet</p>
                    <button
                      onClick={() => setShowForm(true)}
                      className="mt-2 text-sm text-brand-600 dark:text-blue-400 hover:underline"
                    >
                      Create your first template
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Kebab Context Menu */}
      {menuState && (() => {
        const target = templates.find((t) => t.id === menuState.templateId);
        if (!target) return null;
        return (
          <ContextMenu
            x={menuState.x}
            y={menuState.y}
            onClose={() => setMenuState(null)}
            items={getMenuItems(target)}
          />
        );
      })()}
    </div>
  );
}
