import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import Select from "../components/Select";
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

const TYPE_BADGE: Record<string, string> = {
  sales: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  purchase: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  payment: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  receipt: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  journal: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  credit_note: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  debit_note: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400",
  contra: "bg-slate-100 text-slate-600 dark:bg-[#252530] dark:text-[#94a3b8]",
};

const FREQ_BADGE: Record<string, string> = {
  daily: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  weekly: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  monthly: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  yearly: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
};

export default function RecurringTemplatesPage() {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      .catch((err) => setError(err?.message || "Failed to load templates"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
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
      setError(err?.message || "Failed to save template");
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
      setError(err?.message || "Failed to delete");
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await api.post(`/recurring-templates/${id}/run`);
      refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to run template");
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
      setError(err?.message || "Failed to update");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Recurring Templates</h2>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: "", voucher_type: "sales", frequency: "monthly", next_run_date: new Date().toISOString().split("T")[0], template_payload: {} }); }}
          className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600"
        >
          {showForm ? "Cancel" : "+ New Template"}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}

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
            className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600">
            {editingId ? "Update Template" : "Create Template"}
          </button>
        </form>
      )}

      {loading ? (
        <ListSkeleton title="Recurring Templates" cols={4} />
      ) : (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Name</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Frequency</th>
                <th className="pb-2">Next Run</th>
                <th className="pb-2">Last Run</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 dark:border-[#1e1e28]">
                  <td className="py-2 font-medium">{t.name}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${TYPE_BADGE[t.voucher_type] || ""}`}>
                      {t.voucher_type}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${FREQ_BADGE[t.frequency] || ""}`}>
                      {t.frequency}
                    </span>
                  </td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{t.next_run_date}</td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{t.last_run_date || "—"}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${t.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                      {t.is_active ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => handleRunNow(t.id)} className="text-xs text-brand-600 dark:text-violet-400 hover:underline">Run Now</button>
                      <button onClick={() => handleToggleActive(t)} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">
                        {t.is_active ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => handleEdit(t)} className="text-xs text-slate-500 dark:text-[#94a3b8] hover:underline">Edit</button>
                      <button onClick={() => handleDelete(t.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No recurring templates yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
