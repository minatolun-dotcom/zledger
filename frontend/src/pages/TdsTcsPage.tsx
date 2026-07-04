import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { toDisplayDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import Select from "../components/Select";
import { ListSkeleton } from "./skeletons";

interface TdsTcsSection {
  id: string;
  section_code: string;
  section_name: string;
  tds_tcs_type: string;
  rate: number;
  threshold_limit: number;
  is_active: boolean;
}

interface TdsTcsEntry {
  id: string;
  voucher_id: string;
  party_id: string | null;
  section_id: string;
  tds_tcs_type: string;
  base_amount: number;
  rate: number;
  deducted_amount: number;
  entry_date: string;
  status: string;
  challan_number: string | null;
  deposition_date: string | null;
  section_code: string | null;
  section_name: string | null;
  party_name: string | null;
  voucher_number: string | null;
}

interface TdsTcsReturn {
  id: string;
  return_type: string;
  quarter: string;
  financial_year: string;
  status: string;
  total_entries: number;
  total_amount: number;
  total_tax: number;
  filing_date: string | null;
  ack_number: string | null;
}

interface Summary {
  total_entries: number;
  pending_count: number;
  deposited_count: number;
  filed_count: number;
  pending_amount: number;
  deposited_amount: number;
  filed_amount: number;
  total_base_amount: number;
  total_tax_amount: number;
}

interface Party { id: string; name: string; }
interface Voucher { id: string; voucher_number: string; voucher_type: string; }

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  deposited: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  filed: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  draft: "bg-slate-100 dark:bg-[#252530] text-slate-600 dark:text-[#94a3b8]",
};

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TdsTcsPage() {
  const [tab, setTab] = useState<"entries" | "sections" | "returns">("entries");
  const [sections, setSections] = useState<TdsTcsSection[]>([]);
  const [entries, setEntries] = useState<TdsTcsEntry[]>([]);
  const [returns, setReturns] = useState<TdsTcsReturn[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create entry form
  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({ voucher_id: "", party_id: "", section_id: "", base_amount: "", entry_date: "" });
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [parties, setParties] = useState<Party[]>([]);

  // Create section form
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [newSection, setNewSection] = useState({ section_code: "", section_name: "", tds_tcs_type: "tds", rate: "", threshold_limit: "0" });

  // Deposit form
  const [depositIds, setDepositIds] = useState<string[]>([]);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositData, setDepositData] = useState({ challan_number: "", deposition_date: "" });

  // Filter
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const refresh = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterType) params.set("tds_tcs_type", filterType);
    if (filterStatus) params.set("status", filterStatus);

    Promise.all([
      api.get<TdsTcsSection[]>("/tds-tcs/sections"),
      api.get<TdsTcsEntry[]>(`/tds-tcs/entries?${params}`),
      api.get<Summary>("/tds-tcs/summary"),
      api.get<TdsTcsReturn[]>("/tds-tcs/returns"),
    ])
      .then(([s, e, su, r]) => { setSections(s); setEntries(e); setSummary(su); setReturns(r); })
      .catch((err) => setError(err?.detail || "Failed to load data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, [filterType, filterStatus]);

  const loadFormDeps = async () => {
    try {
      const [v, p] = await Promise.all([
        api.get<Voucher[]>("/vouchers"),
        api.get<Party[]>("/coa/parties"),
      ]);
      setVouchers(v);
      setParties(p);
    } catch { /* ignore */ }
  };

  useEffect(() => { if (showCreateEntry) loadFormDeps(); }, [showCreateEntry]);

  useEffect(() => {
    if (!showCreateEntry) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowCreateEntry(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showCreateEntry]);

  useEffect(() => {
    if (!showCreateSection) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowCreateSection(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showCreateSection]);

  useEffect(() => {
    if (!showDeposit) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowDeposit(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showDeposit]);

  const handleCreateEntry = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/tds-tcs/entries", {
        voucher_id: newEntry.voucher_id,
        party_id: newEntry.party_id || null,
        section_id: newEntry.section_id,
        base_amount: parseFloat(newEntry.base_amount),
        entry_date: newEntry.entry_date,
      });
      setShowCreateEntry(false);
      setNewEntry({ voucher_id: "", party_id: "", section_id: "", base_amount: "", entry_date: "" });
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to create entry");
    }
  };

  const handleCreateSection = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/tds-tcs/sections", {
        ...newSection,
        rate: parseFloat(newSection.rate),
        threshold_limit: parseFloat(newSection.threshold_limit),
      });
      setShowCreateSection(false);
      setNewSection({ section_code: "", section_name: "", tds_tcs_type: "tds", rate: "", threshold_limit: "0" });
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to create section");
    }
  };

  const handleSeed = async () => {
    setError("");
    try {
      await api.post("/tds-tcs/sections/seed");
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to seed sections");
    }
  };

  const handleDeposit = async (e: FormEvent) => {
    e.preventDefault();
    if (depositIds.length === 0) return;
    setError("");
    try {
      await api.post("/tds-tcs/deposit", {
        entry_ids: depositIds,
        challan_number: depositData.challan_number,
        deposition_date: depositData.deposition_date,
      });
      setShowDeposit(false);
      setDepositIds([]);
      setDepositData({ challan_number: "", deposition_date: "" });
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to deposit");
    }
  };

  const toggleDepositId = (id: string) => {
    setDepositIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">TDS / TCS</h2>
        <div className="flex gap-2">
          {tab === "entries" && (
            <>
              <button onClick={() => setShowDeposit(true)} disabled={depositIds.length === 0}
                className="rounded-lg bg-brand-600 dark:bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 disabled:opacity-50">
                Deposit ({depositIds.length})
              </button>
              <button onClick={() => setShowCreateEntry(true)}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                + New Entry
              </button>
            </>
          )}
          {tab === "sections" && (
            <div className="flex gap-2">
              <button onClick={handleSeed}
                className="rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">
                Seed Defaults
              </button>
              <button onClick={() => setShowCreateSection(true)}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                + New Section
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Pending</div>
            <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.pending_count}</div>
            <div className="text-xs text-slate-400 dark:text-[#64748b]">₹{fmt(summary.pending_amount)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Deposited</div>
            <div className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{summary.deposited_count}</div>
            <div className="text-xs text-slate-400 dark:text-[#64748b]">₹{fmt(summary.deposited_amount)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Filed</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.filed_count}</div>
            <div className="text-xs text-slate-400 dark:text-[#64748b]">₹{fmt(summary.filed_amount)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#94a3b8]">Total Tax</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">₹{fmt(summary.total_tax_amount)}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-4 flex gap-2 border-b border-slate-200 dark:border-[#1e1e28]">
        {(["entries", "sections", "returns"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? "border-brand-600 dark:border-violet-500/50 text-brand-700 dark:text-violet-400" : "border-transparent text-slate-500 dark:text-[#94a3b8] hover:text-slate-700 dark:hover:text-[#f1f5f9]"
            }`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters for entries */}
      {tab === "entries" && (
        <div className="mt-4 flex gap-4">
          <Select value={filterType} onChange={setFilterType}
            options={[
              { value: "", label: "All Types" },
              { value: "tds", label: "TDS" },
              { value: "tcs", label: "TCS" },
            ]}
            className="w-40" />
          <Select value={filterStatus} onChange={setFilterStatus}
            options={[
              { value: "", label: "All Status" },
              { value: "pending", label: "Pending" },
              { value: "deposited", label: "Deposited" },
              { value: "filed", label: "Filed" },
            ]}
            className="w-40" />
        </div>
      )}

      {error && <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}

      {loading ? (
        <ListSkeleton title="TDS/TCS" cols={4} />
      ) : (
        <div className="mt-4">
          {/* Entries Tab */}
          {tab === "entries" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                  <th className="pb-2 w-8"><input type="checkbox" onChange={(e) => {
                    if (e.target.checked) setDepositIds(entries.filter((x) => x.status === "pending").map((x) => x.id));
                    else setDepositIds([]);
                  }} /></th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Section</th>
                  <th className="pb-2">Party</th>
                  <th className="pb-2">Voucher</th>
                  <th className="pb-2 text-right">Base Amount</th>
                  <th className="pb-2 text-right">Rate</th>
                  <th className="pb-2 text-right">Tax</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Challan</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 dark:border-[#1e1e28]/50 hover:bg-slate-50 dark:hover:bg-[#252530]">
                    <td className="py-2">
                      {entry.status === "pending" && (
                        <input type="checkbox" checked={depositIds.includes(entry.id)}
                          onChange={() => toggleDepositId(entry.id)} />
                      )}
                    </td>
                    <td className="py-2">{toDisplayDate(entry.entry_date)}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        entry.tds_tcs_type === "tds" ? "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400" : "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400"
                      }`}>
                        {entry.tds_tcs_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2">{entry.section_code || "—"}</td>
                    <td className="py-2">{entry.party_name || "—"}</td>
                    <td className="py-2">{entry.voucher_number || "—"}</td>
                    <td className="py-2 text-right font-mono">₹{fmt(entry.base_amount)}</td>
                    <td className="py-2 text-right">{entry.rate}%</td>
                    <td className="py-2 text-right font-mono font-medium">₹{fmt(entry.deducted_amount)}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[entry.status] || ""}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-slate-500 dark:text-[#94a3b8]">{entry.challan_number || "—"}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={11} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No entries found.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {/* Sections Tab */}
          {tab === "sections" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                  <th className="pb-2">Code</th>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Rate</th>
                  <th className="pb-2 text-right">Threshold</th>
                  <th className="pb-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-[#1e1e28]/50">
                    <td className="py-2 font-medium">{s.section_code}</td>
                    <td className="py-2">{s.section_name}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        s.tds_tcs_type === "tds" ? "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400" : "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400"
                      }`}>
                        {s.tds_tcs_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-right">{s.rate}%</td>
                    <td className="py-2 text-right">₹{fmt(s.threshold_limit)}</td>
                    <td className="py-2">{s.is_active ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Returns Tab */}
          {tab === "returns" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Quarter</th>
                  <th className="pb-2">FY</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Entries</th>
                  <th className="pb-2 text-right">Total Amount</th>
                  <th className="pb-2 text-right">Total Tax</th>
                  <th className="pb-2">Filed Date</th>
                  <th className="pb-2">ACK No.</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-[#1e1e28]/50">
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        r.return_type === "tds" ? "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400" : "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400"
                      }`}>
                        {r.return_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 font-medium">{r.quarter}</td>
                    <td className="py-2">{r.financial_year}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.status] || ""}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 text-right">{r.total_entries}</td>
                    <td className="py-2 text-right font-mono">₹{fmt(r.total_amount)}</td>
                    <td className="py-2 text-right font-mono font-medium">₹{fmt(r.total_tax)}</td>
                    <td className="py-2">{toDisplayDate(r.filing_date)}</td>
                    <td className="py-2 text-xs text-slate-500 dark:text-[#94a3b8]">{r.ack_number || "—"}</td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No returns found. Create entries and deposit them first.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Entry Modal */}
      {showCreateEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateEntry(false); }}>
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white dark:bg-[#18181f] p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">New TDS/TCS Entry</h3>
            <form onSubmit={handleCreateEntry} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Voucher</label>
                <Select value={newEntry.voucher_id} onChange={(v) => setNewEntry({ ...newEntry, voucher_id: v })}
                  options={[
                    { value: "", label: "Select voucher…" },
                    ...vouchers.map((v) => ({ value: v.id, label: `${v.voucher_type} #${v.voucher_number}` })),
                  ]}
                  required className="mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Party (optional)</label>
                <Select value={newEntry.party_id} onChange={(v) => setNewEntry({ ...newEntry, party_id: v })}
                  options={[
                    { value: "", label: "Select party…" },
                    ...parties.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  className="mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Section</label>
                <Select value={newEntry.section_id} onChange={(v) => setNewEntry({ ...newEntry, section_id: v })}
                  options={[
                    { value: "", label: "Select section…" },
                    ...sections.map((s) => ({ value: s.id, label: `${s.section_code} - ${s.section_name} (${s.rate}%)` })),
                  ]}
                  required className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Base Amount</label>
                  <input type="number" step="0.01" value={newEntry.base_amount}
                    onChange={(e) => setNewEntry({ ...newEntry, base_amount: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Date</label>
                  <DateInput value={newEntry.entry_date}
                    onChange={(v) => setNewEntry({ ...newEntry, entry_date: v })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm" />
                </div>
              </div>
              {error && <p className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateEntry(false)}
                  className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-2 text-sm text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
                <button type="submit"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Section Modal */}
      {showCreateSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateSection(false); }}>
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white dark:bg-[#18181f] p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">New TDS/TCS Section</h3>
            <form onSubmit={handleCreateSection} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Section Code</label>
                  <input type="text" value={newSection.section_code}
                    onChange={(e) => setNewSection({ ...newSection, section_code: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm"
                    placeholder="e.g., 194C" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Type</label>
                  <Select value={newSection.tds_tcs_type}
                    onChange={(v) => setNewSection({ ...newSection, tds_tcs_type: v })}
                    options={[
                      { value: "tds", label: "TDS" },
                      { value: "tcs", label: "TCS" },
                    ]}
                    className="mt-1" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Section Name</label>
                <input type="text" value={newSection.section_name}
                  onChange={(e) => setNewSection({ ...newSection, section_name: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Rate (%)</label>
                  <input type="number" step="0.01" value={newSection.rate}
                    onChange={(e) => setNewSection({ ...newSection, rate: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Threshold Limit</label>
                  <input type="number" step="0.01" value={newSection.threshold_limit}
                    onChange={(e) => setNewSection({ ...newSection, threshold_limit: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateSection(false)}
                  className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-2 text-sm text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
                <button type="submit"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setShowDeposit(false); }}>
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white dark:bg-[#18181f] p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Deposit TDS/TCS</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#94a3b8]">{depositIds.length} entry/entries selected for deposit.</p>
            <form onSubmit={handleDeposit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Challan Number</label>
                <input type="text" value={depositData.challan_number}
                  onChange={(e) => setDepositData({ ...depositData, challan_number: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Deposition Date</label>
                <DateInput value={depositData.deposition_date}
                  onChange={(v) => setDepositData({ ...depositData, deposition_date: v })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowDeposit(false)}
                  className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#252530]">Cancel</button>
                <button type="submit"
                  className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600">Deposit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
