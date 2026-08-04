import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";
import DateInput from "../components/DateInput";
import Select from "../components/Select";
import Tabs from "../components/Tabs";
import { INDIAN_STATES } from "../components/IndianStates";
import { useRole, usePermissions } from "../hooks/useRole";
import { useToastStore } from "../store/toast";
import { ListSkeleton } from "./skeletons";
import { toDisplayDate, generateFyName, calculateEndDate } from "../utils/dateUtils";
import { MODULES, ALWAYS_ON } from "../config/modules";
import NavIcon from "../components/NavIcon";

type SettingsTab = "general" | "tax" | "contact" | "numbering" | "financial-years" | "modules";

const TABS: { key: SettingsTab; label: string; shortcut?: string }[] = [
  { key: "general", label: "General", shortcut: "F1" },
  { key: "tax", label: "Tax", shortcut: "F2" },
  { key: "contact", label: "Contact & Bank", shortcut: "F3" },
  { key: "numbering", label: "Voucher Numbering", shortcut: "F4" },
  { key: "financial-years", label: "Financial Years", shortcut: "F5" },
  { key: "modules", label: "Modules", shortcut: "F6" },
];

interface CompanyDetails {
  id: string; name: string; legal_name: string | null; gstin: string | null;
  state_code: string | null; pan: string | null; address: string | null;
  phone: string | null; email: string | null; website: string | null;
  bank_name: string | null; bank_account_number: string | null;
  bank_ifsc: string | null; bank_branch: string | null;
  books_begin_from: string | null; is_active: boolean;
  logo_url: string | null; modules: string[];
}

interface VoucherNumberingItem {
  id: string; voucher_type: string; prefix: string;
  format_template: string; next_sequence: number; fy_start_month: number;
}

interface FinancialYear {
  id: string; name: string; start_date: string; end_date: string; is_closed: boolean;
}

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  sales: "Sales Invoice", purchase: "Purchase Invoice", payment: "Payment",
  receipt: "Receipt", contra: "Contra", journal: "Journal",
  credit_note: "Credit Note", debit_note: "Debit Note",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm focus:border-brand-600 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-blue-500/20";

export default function CompanySettingsPage() {
  const { activeCompanyId } = useAuthStore();
  const { canManageMembers } = useRole();
  const { can } = usePermissions();
  const canManageFy = can("manage_financial_years");
  const canManageModules = can("manage_modules");
  const toast = useToastStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<SettingsTab>(
    (searchParams.get("tab") as SettingsTab) || "general"
  );
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [pan, setPan] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [booksBegin, setBooksBegin] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [voucherNumbering, setVoucherNumbering] = useState<VoucherNumberingItem[]>([]);
  const [editingNumbering, setEditingNumbering] = useState<Record<string, { prefix: string; fy_start_month: number }>>({});
  const [savingNumbering, setSavingNumbering] = useState(false);

  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [fyLoading, setFyLoading] = useState(true);
  const [showFyForm, setShowFyForm] = useState(false);
  const [editingFy, setEditingFy] = useState<FinancialYear | null>(null);
  const [fyForm, setFyForm] = useState({ name: "", start_date: "", end_date: "" });
  const [savingFy, setSavingFy] = useState(false);
  const [confirmDeleteFy, setConfirmDeleteFy] = useState<string | null>(null);

  const [modules, setModules] = useState<string[]>([]);

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoading(true);
    api.get<CompanyDetails>(`/companies/${activeCompanyId}`)
      .then((c) => {
        setName(c.name); setLegalName(c.legal_name ?? ""); setGstin(c.gstin ?? "");
        setStateCode(c.state_code ?? ""); setPan(c.pan ?? ""); setAddress(c.address ?? "");
        setPhone(c.phone ?? ""); setEmail(c.email ?? ""); setWebsite(c.website ?? "");
        setBankName(c.bank_name ?? ""); setBankAccount(c.bank_account_number ?? "");
        setBankIfsc(c.bank_ifsc ?? ""); setBankBranch(c.bank_branch ?? "");
        setBooksBegin(c.books_begin_from ?? ""); setLogoUrl(c.logo_url ?? null);
        setModules(c.modules ?? MODULES.map((m) => m.id));
      })
      .finally(() => setLoading(false));

    api.get<VoucherNumberingItem[]>(`/companies/${activeCompanyId}/voucher-numbering`)
      .then((items) => {
        setVoucherNumbering(items);
        const editing: Record<string, { prefix: string; fy_start_month: number }> = {};
        items.forEach((item) => { editing[item.voucher_type] = { prefix: item.prefix, fy_start_month: item.fy_start_month }; });
        setEditingNumbering(editing);
      }).catch(() => {});

    loadFys();
  }, [activeCompanyId]);

  // Auto-open from command palette (?action=new-fy)
  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) return;
    setSearchParams({}, { replace: true });
    if (action === "new-fy") { setTab("financial-years"); setTimeout(() => openFyCreate(), 100); }
  }, [searchParams]);

  const loadFys = () => {
    setFyLoading(true);
    api.get<FinancialYear[]>("/coa/financial-years")
      .then(setFys)
      .catch(() => {})
      .finally(() => setFyLoading(false));
  };

  const handleSave = async () => {
    if (!activeCompanyId || !name.trim()) { setError("Company name is required"); return; }
    setError(""); setSaving(true);
    try {
      await api.patch(`/companies/${activeCompanyId}`, {
        name: name.trim(), legal_name: legalName || null, gstin: gstin || null,
        state_code: stateCode || null, pan: pan || null, address: address || null,
        phone: phone || null, email: email || null, website: website || null,
        bank_name: bankName || null, bank_account_number: bankAccount || null,
        bank_ifsc: bankIfsc || null, bank_branch: bankBranch || null,
        books_begin_from: booksBegin || null,
      });
      toast.success("Company details updated");
      window.dispatchEvent(new Event("company-updated"));
    } catch (err: any) { setError(err?.message || "Failed to update company"); }
    finally { setSaving(false); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCompanyId) return;
    setError(""); setUploadingLogo(true);
    try {
      const form = new FormData(); form.append("file", file);
      await api.post(`/companies/${activeCompanyId}/logo`, form);
      setLogoUrl(`/api/companies/${activeCompanyId}/logo?t=${Date.now()}`);
      toast.success("Logo uploaded");
      window.dispatchEvent(new Event("company-updated"));
    } catch (err: any) { setError(err?.message || "Failed to upload logo"); }
    finally { setUploadingLogo(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleLogoDelete = async () => {
    if (!activeCompanyId) return; setError("");
    try {
      await api.del(`/companies/${activeCompanyId}/logo`);
      setLogoUrl(null); toast.success("Logo removed");
      window.dispatchEvent(new Event("company-updated"));
    } catch (err: any) { setError(err?.message || "Failed to remove logo"); }
  };

  const handleNumberingChange = (vt: string, field: "prefix" | "fy_start_month", value: string | number) => {
    setEditingNumbering((prev) => ({ ...prev, [vt]: { ...prev[vt], [field]: value } }));
  };

  const handleSaveNumbering = async () => {
    if (!activeCompanyId) return; setSavingNumbering(true);
    try {
      for (const item of voucherNumbering) {
        const edits = editingNumbering[item.voucher_type];
        if (edits && (edits.prefix !== item.prefix || edits.fy_start_month !== item.fy_start_month)) {
          await api.patch(`/companies/${activeCompanyId}/voucher-numbering/${item.voucher_type}`, {
            prefix: edits.prefix, format_template: "{PREFIX}-{YEAR}-{SEQ}", fy_start_month: edits.fy_start_month,
          });
        }
      }
      toast.success("Voucher numbering updated");
      const items = await api.get<VoucherNumberingItem[]>(`/companies/${activeCompanyId}/voucher-numbering`);
      setVoucherNumbering(items);
    } catch (err: any) { setError(err?.message || "Failed to update voucher numbering"); }
    finally { setSavingNumbering(false); }
  };

  const handleResetSequence = async (vt: string) => {
    if (!activeCompanyId) return;
    try {
      await api.post(`/companies/${activeCompanyId}/voucher-numbering/${vt}/reset`, { next_sequence: 1 });
      toast.success("Sequence reset to 1");
      const items = await api.get<VoucherNumberingItem[]>(`/companies/${activeCompanyId}/voucher-numbering`);
      setVoucherNumbering(items);
    } catch (err: any) { setError(err?.message || "Failed to reset sequence"); }
  };

  const openFyCreate = () => { setEditingFy(null); setFyForm({ name: "", start_date: "", end_date: "" }); setShowFyForm(true); };
  const openFyEdit = (fy: FinancialYear) => { setEditingFy(fy); setFyForm({ name: fy.name, start_date: fy.start_date, end_date: fy.end_date }); setShowFyForm(true); };

  const handleFyStartChange = (v: string) => {
    setFyForm((f) => ({ ...f, start_date: v, end_date: v ? calculateEndDate(v) : "", name: v ? generateFyName(v) : f.name }));
  };

  const handleSaveFy = async () => {
    if (!fyForm.name || !fyForm.start_date || !fyForm.end_date) { toast.error("All fields are required."); return; }
    setSavingFy(true);
    try {
      if (editingFy) {
        await api.patch(`/coa/financial-years/${editingFy.id}`, fyForm);
      } else {
        await api.post("/coa/financial-years", fyForm);
      }
      setShowFyForm(false); loadFys();
      toast.success(editingFy ? "Financial year updated" : "Financial year created");
    } catch (e: any) { toast.error(e?.message || "Failed to save"); }
    finally { setSavingFy(false); }
  };

  const handleDeleteFy = async (id: string) => {
    try { await api.del(`/coa/financial-years/${id}`); setConfirmDeleteFy(null); loadFys(); toast.success("Financial year deleted"); }
    catch (e: any) { toast.error(e?.message || "Failed to delete"); setConfirmDeleteFy(null); }
  };

  const handleToggleCloseFy = async (fy: FinancialYear) => {
    try { await api.patch(`/coa/financial-years/${fy.id}/close`, {}); loadFys(); toast.success(fy.is_closed ? "Financial year reopened" : "Financial year closed"); }
    catch (e: any) { toast.error(e?.message || "Failed to toggle close"); }
  };

  const handleSaveModules = async () => {
    if (!activeCompanyId) return;
    setSaving(true);
    try {
      await api.patch(`/companies/${activeCompanyId}`, { modules });
      toast.success("Modules updated");
      window.dispatchEvent(new Event("company-updated"));
      useAuthStore.getState().fetchMe();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to update modules"); }
    finally { setSaving(false); }
  };

  if (loading) return <ListSkeleton title="Company Settings" cols={2} rows={3} />;

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] mb-2">Company Settings</h1>
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">

      <Tabs
        tabs={TABS}
        active={tab}
        onChange={(k) => setTab(k as SettingsTab)}
        className="mb-5"
      />

      {/* ── General Tab ── */}
      {tab === "general" && (
        <div className="grid max-w-3xl gap-5">
          <Section title="Company Logo">
            <div className="flex items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#08080c] overflow-hidden">
                {logoUrl ? <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" /> : (
                  <svg className="h-8 w-8 text-slate-400 dark:text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} className="hidden" />
                {canManageMembers && (
                  <>
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}
                      className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] disabled:opacity-50">
                      {uploadingLogo ? "Uploading..." : logoUrl ? "Change Logo" : "Upload Logo"}
                    </button>
                    {logoUrl && (
                      <button onClick={handleLogoDelete}
                        className="rounded-lg border border-red-200 dark:border-red-900/50 px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                        Remove Logo
                      </button>
                    )}
                  </>
                )}
                <p className="text-xs text-slate-400 dark:text-[#64748b]">PNG or JPG, max 2 MB</p>
              </div>
            </div>
          </Section>
          <Section title="General">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company Name *">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Legal Name">
                <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Books Begin From">
                <DateInput value={booksBegin} onChange={setBooksBegin} className={inputCls} />
              </Field>
            </div>
          </Section>
          {canManageMembers && (
            <div>
              <button onClick={handleSave} disabled={saving} className="btn-primary px-6 py-2 text-sm font-medium">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tax Tab ── */}
      {tab === "tax" && (
        <div className="grid max-w-3xl gap-5">
          <Section title="Tax Registration">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="GSTIN">
                <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27AAAAA1111A1Z5" className={inputCls} />
              </Field>
              <Field label="PAN">
                <input type="text" value={pan} onChange={(e) => setPan(e.target.value)} placeholder="AAAAA1111A" className={inputCls} />
              </Field>
              <Field label="State">
                <Select value={stateCode} onChange={setStateCode} options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }))} placeholder="Select state" />
              </Field>
            </div>
          </Section>
          {canManageMembers && (
            <div>
              <button onClick={handleSave} disabled={saving} className="btn-primary px-6 py-2 text-sm font-medium">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Contact & Bank Tab ── */}
      {tab === "contact" && (
        <div className="grid max-w-3xl gap-5">
          <Section title="Contact Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Phone">
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
              </Field>
              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@company.com" className={inputCls} />
              </Field>
              <Field label="Website">
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://company.com" className={inputCls} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Address">
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputCls} />
              </Field>
            </div>
          </Section>
          <Section title="Bank Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Bank Name">
                <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="State Bank of India" className={inputCls} />
              </Field>
              <Field label="Branch">
                <input type="text" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="Main Branch" className={inputCls} />
              </Field>
              <Field label="Account Number">
                <input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="1234567890" className={inputCls} />
              </Field>
              <Field label="IFSC Code">
                <input type="text" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value)} placeholder="SBIN0001234" className={inputCls} />
              </Field>
            </div>
          </Section>
          {canManageMembers && (
            <div>
              <button onClick={handleSave} disabled={saving} className="btn-primary px-6 py-2 text-sm font-medium">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Voucher Numbering Tab ── */}
      {tab === "numbering" && (
        <div className="grid max-w-4xl gap-5">
          <Section title="Voucher Numbering">
            <p className="mb-4 text-xs text-slate-500 dark:text-[#64748b]">Configure voucher number format. Numbers reset each financial year.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#282832]">
                    <th className="pb-2 text-left text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Voucher Type</th>
                    <th className="pb-2 text-left text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Prefix</th>
                    <th className="pb-2 text-left text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">FY Start Month</th>
                    <th className="pb-2 text-left text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Next Sequence</th>
                    <th className="pb-2 text-left text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Preview</th>
                    <th className="pb-2 text-left text-xs font-medium text-slate-500 dark:text-[#cbd5e1]"></th>
                  </tr>
                </thead>
                <tbody>
                  {voucherNumbering.map((item) => {
                    const edits = editingNumbering[item.voucher_type] || { prefix: item.prefix, fy_start_month: item.fy_start_month };
                    const fyYear = new Date().getFullYear();
                    const preview = `${edits.prefix}-${fyYear}-${String(item.next_sequence).padStart(4, "0")}`;
                    return (
                      <tr key={item.voucher_type} className="border-b border-slate-100 dark:border-[#1a1a24]">
                        <td className="py-2 font-medium text-slate-700 dark:text-[#f1f5f9]">{VOUCHER_TYPE_LABELS[item.voucher_type] || item.voucher_type}</td>
                        <td className="py-2">
                          <input type="text" value={edits.prefix} onChange={(e) => handleNumberingChange(item.voucher_type, "prefix", e.target.value)}
                            className="w-24 rounded-lg border border-slate-300 dark:border-[#282832] px-2 py-1 text-sm focus:border-brand-600 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-blue-500/20" />
                        </td>
                        <td className="py-2">
                          <Select value={String(edits.fy_start_month)} onChange={(v) => handleNumberingChange(item.voucher_type, "fy_start_month", parseInt(v))}
                            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i).toLocaleString("default", { month: "long" }) }))} />
                        </td>
                        <td className="py-2 text-slate-600 dark:text-[#cbd5e1]">{item.next_sequence}</td>
                        <td className="py-2 font-mono text-xs text-slate-500 dark:text-[#64748b]">{preview}</td>
                        <td className="py-2">
                          <button onClick={() => handleResetSequence(item.voucher_type)} className="text-xs text-slate-400 hover:text-red-500 dark:text-[#64748b] dark:hover:text-red-400" title="Reset sequence to 1">Reset</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
          {canManageMembers && (
            <div>
              <button onClick={handleSaveNumbering} disabled={savingNumbering} className="btn-primary px-6 py-2 text-sm font-medium">
                {savingNumbering ? "Saving..." : "Save Voucher Numbering"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Financial Years Tab ── */}
      {tab === "financial-years" && (
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500 dark:text-[#64748b]">Manage your financial years. Active year determines the reporting period.</p>
            {canManageFy && (
              <button onClick={openFyCreate} className="btn-primary px-3 py-1.5 text-sm font-medium">+ New Financial Year</button>
            )}
          </div>

          {showFyForm && (
            <div className="mb-4 rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
              <h3 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">{editingFy ? "Edit Financial Year" : "New Financial Year"}</h3>
              <div className="space-y-3">
                <Field label="Name">
                  <input value={fyForm.name} onChange={(e) => setFyForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. 2026-27" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Start Date">
                    <DateInput value={fyForm.start_date} onChange={handleFyStartChange} className={inputCls} />
                  </Field>
                  <Field label="End Date">
                    <DateInput value={fyForm.end_date} onChange={(v) => setFyForm((f) => ({ ...f, end_date: v }))} className={inputCls} />
                  </Field>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={handleSaveFy} disabled={savingFy} className="btn-primary px-4 py-1.5 text-sm font-medium">
                  {savingFy ? "Saving..." : editingFy ? "Update" : "Create"}
                </button>
                <button onClick={() => setShowFyForm(false)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Cancel</button>
              </div>
            </div>
          )}

          {fyLoading ? (
            <ListSkeleton title="" cols={5} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 dark:border-[#1a1a24] bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#cbd5e1]">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Start Date</th>
                    <th className="px-4 py-2">End Date</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fys.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 dark:text-[#64748b]">No financial years found.</td></tr>
                  )}
                  {fys.map((fy) => (
                    <tr key={fy.id} className="border-t border-slate-100 dark:border-[#1a1a24]">
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-[#f1f5f9]">{fy.name}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-[#cbd5e1]">{toDisplayDate(fy.start_date)}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-[#cbd5e1]">{toDisplayDate(fy.end_date)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${fy.is_closed ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                          {fy.is_closed ? "Closed" : "Open"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManageFy && (
                            <>
                              <button onClick={() => handleToggleCloseFy(fy)}
                                className={`rounded px-2 py-1 text-xs font-medium ${fy.is_closed ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100" : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-100"}`}>
                                {fy.is_closed ? "Reopen" : "Close"}
                              </button>
                              <button onClick={() => openFyEdit(fy)} className="rounded bg-slate-50 dark:bg-[#282832] px-2 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100">Edit</button>
                              {confirmDeleteFy === fy.id ? (
                                <>
                                  <button onClick={() => handleDeleteFy(fy.id)} className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700">Confirm</button>
                                  <button onClick={() => setConfirmDeleteFy(null)} className="rounded bg-slate-50 dark:bg-[#282832] px-2 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Cancel</button>
                                </>
                              ) : (
                                <button onClick={() => setConfirmDeleteFy(fy.id)} className="rounded bg-red-50 dark:bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100">Delete</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modules Tab ── */}
      {tab === "modules" && (
        <div className="max-w-3xl">
          <Section title="Company Modules">
            <p className="mb-4 text-xs text-slate-500 dark:text-[#64748b]">
              Enable or disable features for this company. Core Accounting and Reports are always on.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {MODULES.map((m) => {
                const isOn = modules.includes(m.id);
                const locked = ALWAYS_ON.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      if (locked) return;
                      setModules((prev) =>
                        isOn ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                      );
                    }}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      isOn
                        ? "border-blue-500/50 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10"
                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-[#282832] dark:bg-[#0f0f16] dark:hover:border-[#383848]"
                    } ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <NavIcon name={m.icon} className={`h-5 w-5 shrink-0 ${isOn ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-[#64748b]"}`} />
                    <div className="min-w-0">
                      <span className={`block text-sm font-medium ${isOn ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-[#cbd5e1]"}`}>{m.label}</span>
                      <span className="block text-xs text-slate-400 dark:text-[#64748b]">{m.description}</span>
                    </div>
                    {locked && <span className="ml-auto text-[10px] text-slate-400 dark:text-[#64748b]">always on</span>}
                  </button>
                );
              })}
            </div>
          </Section>
          {canManageModules && (
            <div className="mt-4">
              <button onClick={handleSaveModules} disabled={saving} className="btn-primary px-6 py-2 text-sm font-medium inline-flex items-center gap-2">{saving ? <><span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Saving...</> : "Save Modules"}</button>
            </div>
          )}
        </div>
      )}
        </div>
        <div className="w-[300px] shrink-0 hidden lg:block self-start sticky top-4 mt-[60px] space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Company Snapshot</h3>
            <div className="space-y-2">
              <div>
                <span className="text-slate-500 dark:text-[#94a3b8]">Name</span>
                <p className="text-slate-800 dark:text-[#f1f5f9] font-medium truncate">{name || "-"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#94a3b8]">Legal Name</span>
                <p className="text-slate-800 dark:text-[#f1f5f9] truncate">{legalName || "-"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#94a3b8]">GSTIN</span>
                <p className="text-slate-800 dark:text-[#f1f5f9] font-mono">{gstin ? gstin : <span className="text-slate-400 dark:text-[#64748b]">Not registered</span>}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#94a3b8]">PAN</span>
                <p className="text-slate-800 dark:text-[#f1f5f9] font-mono">{pan || "-"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#94a3b8]">State</span>
                <p className="text-slate-800 dark:text-[#f1f5f9]">{stateCode ? INDIAN_STATES.find((s) => s.code === stateCode)?.name || stateCode : "-"}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#94a3b8]">Phone</span>
                <p className="text-slate-800 dark:text-[#f1f5f9]">{phone || <span className="text-slate-400 dark:text-[#64748b]">Not set</span>}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#94a3b8]">Email</span>
                <p className="text-slate-800 dark:text-[#f1f5f9] truncate">{email || <span className="text-slate-400 dark:text-[#64748b]">Not set</span>}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-[#94a3b8]">Books Begin</span>
                <p className="text-slate-800 dark:text-[#f1f5f9]">{booksBegin ? toDisplayDate(booksBegin) : <span className="text-slate-400 dark:text-[#64748b]">Not set</span>}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Quick Links</h3>
            <div className="space-y-2">
              <button onClick={() => navigate("/chart-of-accounts")}
                className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors cursor-pointer">
                Chart of Accounts
              </button>
              <button onClick={() => navigate("/parties")}
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors cursor-pointer">
                Parties
              </button>
              <button onClick={() => navigate("/vouchers")}
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors cursor-pointer">
                Vouchers
              </button>
              <button onClick={() => navigate("/dashboard")}
                className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors cursor-pointer">
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
