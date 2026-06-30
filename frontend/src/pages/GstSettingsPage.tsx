import { useEffect, useState } from "react";
import { api } from "../api/client";

interface HsnSac {
  id: string;
  code: string;
  description: string;
  gst_rate: number;
  code_type: string;
  is_active: boolean;
}

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
}

type Tab = "hsn-sac" | "registrations";

export default function GstSettingsPage() {
  const [tab, setTab] = useState<Tab>("hsn-sac");
  const [hsnSacList, setHsnSacList] = useState<HsnSac[]>([]);
  const [registrations, setRegistrations] = useState<GstRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  // HSN/SAC form state
  const [showHsnForm, setShowHsnForm] = useState(false);
  const [hsnForm, setHsnForm] = useState({ code: "", description: "", gst_rate: 18, code_type: "hsn" });

  // Registration form state
  const [showRegForm, setShowRegForm] = useState(false);
  const [regForm, setRegForm] = useState({
    gstin: "",
    legal_name: "",
    trade_name: "",
    state_code: "27",
    pan: "",
    address: "",
    is_primary: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    setLoading(true);
    Promise.all([
      api.get<HsnSac[]>("/gst/hsn-sac"),
      api.get<GstRegistration[]>("/gst/registrations"),
    ])
      .then(([h, r]) => { setHsnSacList(h); setRegistrations(r); })
      .finally(() => setLoading(false));
  }

  async function handleCreateHsnSac() {
    try {
      await api.post("/gst/hsn-sac", hsnForm);
      setShowHsnForm(false);
      setHsnForm({ code: "", description: "", gst_rate: 18, code_type: "hsn" });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create HSN/SAC");
    }
  }

  async function handleDeleteHsnSac(id: string) {
    if (!confirm("Delete this HSN/SAC code?")) return;
    try {
      await api.del(`/gst/hsn-sac/${id}`);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleCreateRegistration() {
    try {
      await api.post("/gst/registrations", regForm);
      setShowRegForm(false);
      setRegForm({ gstin: "", legal_name: "", trade_name: "", state_code: "27", pan: "", address: "", is_primary: false });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create registration");
    }
  }

  async function handleDeleteRegistration(id: string) {
    if (!confirm("Delete this GST registration?")) return;
    try {
      await api.del(`/gst/registrations/${id}`);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">GST Settings</h2>
        <div className="flex gap-1">
          {(["hsn-sac", "registrations"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#252530]"
              }`}
            >
              {t === "hsn-sac" ? "HSN/SAC Codes" : "GST Registrations"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading…</p>
      ) : tab === "hsn-sac" ? (
        <div className="mt-4">
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowHsnForm(!showHsnForm)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {showHsnForm ? "Cancel" : "+ Add HSN/SAC"}
            </button>
          </div>

          {showHsnForm && (
            <div className="mb-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Code</label>
                  <input
                    type="text"
                    value={hsnForm.code}
                    onChange={(e) => setHsnForm({ ...hsnForm, code: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="e.g. 998314"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Description</label>
                  <input
                    type="text"
                    value={hsnForm.description}
                    onChange={(e) => setHsnForm({ ...hsnForm, description: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="e.g. Other IT services"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">GST Rate (%)</label>
                  <input
                    type="number"
                    value={hsnForm.gst_rate}
                    onChange={(e) => setHsnForm({ ...hsnForm, gst_rate: Number(e.target.value) })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    min={0}
                    max={100}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Type</label>
                  <select
                    value={hsnForm.code_type}
                    onChange={(e) => setHsnForm({ ...hsnForm, code_type: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                  >
                    <option value="hsn">HSN</option>
                    <option value="sac">SAC</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleCreateHsnSac}
                className="mt-4 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Save
              </button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Code</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Type</th>
                <th className="pb-2 text-right">GST Rate</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {hsnSacList.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 dark:border-[#1e1e28]/50">
                  <td className="py-2 font-medium text-slate-900 dark:text-[#f1f5f9]">{h.code}</td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{h.description}</td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8] uppercase">{h.code_type}</td>
                  <td className="py-2 text-right font-medium">{h.gst_rate}%</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${h.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                      {h.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => handleDeleteHsnSac(h.id)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Delete</button>
                  </td>
                </tr>
              ))}
              {hsnSacList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#64748b]">
                    No HSN/SAC codes yet. Add your first code above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowRegForm(!showRegForm)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {showRegForm ? "Cancel" : "+ Add Registration"}
            </button>
          </div>

          {showRegForm && (
            <div className="mb-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">GSTIN</label>
                  <input
                    type="text"
                    value={regForm.gstin}
                    onChange={(e) => setRegForm({ ...regForm, gstin: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Legal Name</label>
                  <input
                    type="text"
                    value={regForm.legal_name}
                    onChange={(e) => setRegForm({ ...regForm, legal_name: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">Trade Name</label>
                  <input
                    type="text"
                    value={regForm.trade_name}
                    onChange={(e) => setRegForm({ ...regForm, trade_name: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">State Code</label>
                  <input
                    type="text"
                    value={regForm.state_code}
                    onChange={(e) => setRegForm({ ...regForm, state_code: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="27"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8]">PAN</label>
                  <input
                    type="text"
                    value={regForm.pan}
                    onChange={(e) => setRegForm({ ...regForm, pan: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm"
                    placeholder="AAAAA0000A"
                    maxLength={10}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={regForm.is_primary}
                      onChange={(e) => setRegForm({ ...regForm, is_primary: e.target.checked })}
                      className="rounded border-slate-300 dark:border-[#252530]"
                    />
                    <span className="text-sm text-slate-600 dark:text-[#94a3b8]">Primary GSTIN</span>
                  </label>
                </div>
              </div>
              <button
                onClick={handleCreateRegistration}
                className="mt-4 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Save
              </button>
            </div>
          )}

          <div className="space-y-3">
            {registrations.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 dark:border-[#1e1e28] p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{r.gstin}</span>
                      {r.is_primary && (
                        <span className="rounded-full bg-brand-50 dark:bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-violet-400">Primary</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-[#94a3b8]">{r.legal_name}</div>
                    {r.trade_name && <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Trade: {r.trade_name}</div>}
                    <div className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">State: {r.state_code} {r.pan && `| PAN: ${r.pan}`}</div>
                  </div>
                  <button onClick={() => handleDeleteRegistration(r.id)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">Delete</button>
                </div>
              </div>
            ))}
            {registrations.length === 0 && (
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
