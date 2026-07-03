import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";

interface GstRegistration {
  id: string;
  gstin: string;
  legal_name: string;
  trade_name: string | null;
  state_code: string;
  pan: string | null;
  address: string | null;
  is_primary: boolean;
  is_active: boolean;
  registration_type: string;
  composition_rate: number | null;
}

export default function GstRegistrationsPage() {
  const [list, setList] = useState<GstRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const toast = useToastStore();
  const [form, setForm] = useState({
    gstin: "",
    legal_name: "",
    trade_name: "",
    state_code: "27",
    pan: "",
    address: "",
    is_primary: false,
    registration_type: "regular",
    composition_rate: null as number | null,
  });

  const REG_TYPE_OPTIONS = [
    { value: "regular", label: "Regular" },
    { value: "composition", label: "Composition" },
  ];

  useEffect(() => { loadData(); }, []);

  function loadData() {
    setLoading(true);
    api.get<GstRegistration[]>("/gst/registrations").then(setList).finally(() => setLoading(false));
  }

  async function handleCreate() {
    try {
      await api.post("/gst/registrations", form);
      setShowForm(false);
      setForm({ gstin: "", legal_name: "", trade_name: "", state_code: "27", pan: "", address: "", is_primary: false, registration_type: "regular", composition_rate: null });
      loadData();
      toast.success("GST registration created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create registration");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this GST registration?")) return;
    try {
      await api.del(`/gst/registrations/${id}`);
      loadData();
      toast.success("GST registration deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">GST Registrations</h2>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading…</p>
      ) : (
        <div className="mt-4">
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowForm(!showForm)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {showForm ? "Cancel" : "+ Add Registration"}
            </button>
          </div>

          {showForm && (
            <div className="mb-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">GSTIN</label>
                  <input
                    type="text"
                    value={form.gstin}
                    onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Legal Name</label>
                  <input
                    type="text"
                    value={form.legal_name}
                    onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Trade Name</label>
                  <input
                    type="text"
                    value={form.trade_name}
                    onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">State Code</label>
                  <input
                    type="text"
                    value={form.state_code}
                    onChange={(e) => setForm({ ...form, state_code: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="27"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">PAN</label>
                  <input
                    type="text"
                    value={form.pan}
                    onChange={(e) => setForm({ ...form, pan: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="AAAAA0000A"
                    maxLength={10}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.is_primary}
                      onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                      className="rounded border-slate-300 dark:border-[#252530]"
                    />
                    <span className="text-sm text-slate-600 dark:text-[#94a3b8]">Primary GSTIN</span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Registration Type</label>
                  <Select
                    value={form.registration_type}
                    onChange={(v) => setForm({ ...form, registration_type: v, composition_rate: v === "regular" ? null : form.composition_rate })}
                    options={REG_TYPE_OPTIONS}
                    className="mt-1"
                  />
                </div>
                {form.registration_type === "composition" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Composition Rate (%)</label>
                    <input
                      type="number"
                      value={form.composition_rate ?? ""}
                      onChange={(e) => setForm({ ...form, composition_rate: e.target.value ? Number(e.target.value) : null })}
                      className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                      placeholder="1, 5, or 6"
                      min={0}
                      max={100}
                      step={0.5}
                    />
                  </div>
                )}
              </div>
              <button
                onClick={handleCreate}
                className="mt-4 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Save
              </button>
            </div>
          )}

          <div className="space-y-3">
            {list.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 dark:border-[#1e1e28] p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{r.gstin}</span>
                      {r.is_primary && (
                        <span className="rounded-full bg-brand-50 dark:bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-violet-400">Primary</span>
                      )}
                      {r.registration_type === "composition" && (
                        <span className="rounded-full bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Composition{r.composition_rate ? ` ${r.composition_rate}%` : ""}</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-[#94a3b8]">{r.legal_name}</div>
                    {r.trade_name && <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Trade: {r.trade_name}</div>}
                    <div className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">State: {r.state_code} {r.pan && `| PAN: ${r.pan}`}</div>
                  </div>
                  <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Delete</button>
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <div className="py-8 text-center text-slate-400 dark:text-[#64748b]">
                No GST registrations yet. Add your first registration above.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
