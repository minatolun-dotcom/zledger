import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";
import DateInput from "../components/DateInput";

import Select from "../components/Select";
import { INDIAN_STATES } from "../components/IndianStates";
import { useRole } from "../hooks/useRole";
import { useToastStore } from "../store/toast";
import { ListSkeleton } from "./skeletons";

interface CompanyDetails {
  id: string; name: string; legal_name: string | null; gstin: string | null;
  state_code: string | null; pan: string | null; address: string | null;
  phone: string | null; email: string | null; website: string | null;
  bank_name: string | null; bank_account_number: string | null;
  bank_ifsc: string | null;   bank_branch: string | null;
  books_begin_from: string | null; is_active: boolean;
  logo_url: string | null;
}

interface VoucherNumberingItem {
  id: string;
  voucher_type: string;
  prefix: string;
  format_template: string;
  next_sequence: number;
  fy_start_month: number;
}

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  sales: "Sales Invoice",
  purchase: "Purchase Invoice",
  payment: "Payment",
  receipt: "Receipt",
  contra: "Contra",
  journal: "Journal",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
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
  const toast = useToastStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (!activeCompanyId) return;
    setLoading(true);
    api.get<CompanyDetails>(`/companies/${activeCompanyId}`)
      .then((c) => {
        setName(c.name);
        setLegalName(c.legal_name ?? "");
        setGstin(c.gstin ?? "");
        setStateCode(c.state_code ?? "");
        setPan(c.pan ?? "");
        setAddress(c.address ?? "");
        setPhone(c.phone ?? "");
        setEmail(c.email ?? "");
        setWebsite(c.website ?? "");
        setBankName(c.bank_name ?? "");
        setBankAccount(c.bank_account_number ?? "");
        setBankIfsc(c.bank_ifsc ?? "");
        setBankBranch(c.bank_branch ?? "");
        setBooksBegin(c.books_begin_from ?? "");
        setLogoUrl(c.logo_url ?? null);
      })
      .finally(() => setLoading(false));

    api.get<VoucherNumberingItem[]>(`/companies/${activeCompanyId}/voucher-numbering`)
      .then((items) => {
        setVoucherNumbering(items);
        const editing: Record<string, { prefix: string; fy_start_month: number }> = {};
        items.forEach((item) => {
          editing[item.voucher_type] = { prefix: item.prefix, fy_start_month: item.fy_start_month };
        });
        setEditingNumbering(editing);
      })
      .catch(() => {});
  }, [activeCompanyId]);

  const handleSave = async () => {
    if (!activeCompanyId || !name.trim()) { setError("Company name is required"); return; }
    setError(""); setSaving(true);
    try {
      await api.patch(`/companies/${activeCompanyId}`, {
        name: name.trim(),
        legal_name: legalName || null,
        gstin: gstin || null,
        state_code: stateCode || null,
        pan: pan || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        bank_name: bankName || null,
        bank_account_number: bankAccount || null,
        bank_ifsc: bankIfsc || null,
        bank_branch: bankBranch || null,
        books_begin_from: booksBegin || null,
      });
      toast.success("Company details updated");
      window.dispatchEvent(new Event("company-updated"));
    } catch (err: any) {
      setError(err?.message || "Failed to update company");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCompanyId) return;
    setError("");
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/companies/${activeCompanyId}/logo`, form);
      setLogoUrl(`/api/companies/${activeCompanyId}/logo?t=${Date.now()}`);
      toast.success("Logo uploaded");
      window.dispatchEvent(new Event("company-updated"));
    } catch (err: any) {
      setError(err?.message || "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLogoDelete = async () => {
    if (!activeCompanyId) return;
    setError("");
    try {
      await api.del(`/companies/${activeCompanyId}/logo`);
      setLogoUrl(null);
      toast.success("Logo removed");
      window.dispatchEvent(new Event("company-updated"));
    } catch (err: any) {
      setError(err?.message || "Failed to remove logo");
    }
  };

  const handleNumberingChange = (voucherType: string, field: "prefix" | "fy_start_month", value: string | number) => {
    setEditingNumbering((prev) => ({
      ...prev,
      [voucherType]: { ...prev[voucherType], [field]: value },
    }));
  };

  const handleSaveNumbering = async () => {
    if (!activeCompanyId) return;
    setSavingNumbering(true);
    try {
      for (const item of voucherNumbering) {
        const edits = editingNumbering[item.voucher_type];
        if (edits && (edits.prefix !== item.prefix || edits.fy_start_month !== item.fy_start_month)) {
          await api.patch(`/companies/${activeCompanyId}/voucher-numbering/${item.voucher_type}`, {
            prefix: edits.prefix,
            format_template: "{PREFIX}-{YEAR}-{SEQ}",
            fy_start_month: edits.fy_start_month,
          });
        }
      }
      toast.success("Voucher numbering updated");
      const items = await api.get<VoucherNumberingItem[]>(`/companies/${activeCompanyId}/voucher-numbering`);
      setVoucherNumbering(items);
    } catch (err: any) {
      setError(err?.message || "Failed to update voucher numbering");
    } finally {
      setSavingNumbering(false);
    }
  };

  const handleResetSequence = async (voucherType: string) => {
    if (!activeCompanyId) return;
    try {
      await api.post(`/companies/${activeCompanyId}/voucher-numbering/${voucherType}/reset`, { next_sequence: 1 });
      toast.success("Sequence reset to 1");
      const items = await api.get<VoucherNumberingItem[]>(`/companies/${activeCompanyId}/voucher-numbering`);
      setVoucherNumbering(items);
    } catch (err: any) {
      setError(err?.message || "Failed to reset sequence");
    }
  };

  if (loading) return <ListSkeleton title="Company Settings" cols={2} rows={3} />;

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Company Settings</h1>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 grid max-w-3xl gap-5">
        <Section title="Company Logo">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-[#282832] bg-slate-50 dark:bg-[#08080c] overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
              ) : (
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

        <Section title="Tax Registration">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="GSTIN">
              <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27AAAAA1111A1Z5" className={inputCls} />
            </Field>
            <Field label="PAN">
              <input type="text" value={pan} onChange={(e) => setPan(e.target.value)} placeholder="AAAAA1111A" className={inputCls} />
            </Field>
            <Field label="State">
              <Select
                value={stateCode}
                onChange={setStateCode}
                options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }))}
                placeholder="Select state"
              />
            </Field>
          </div>
        </Section>

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

        <Section title="Voucher Numbering">
          <p className="mb-4 text-xs text-slate-500 dark:text-[#64748b]">
            Configure voucher number format. Numbers reset each financial year.
          </p>
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
                      <td className="py-2 font-medium text-slate-700 dark:text-[#f1f5f9]">
                        {VOUCHER_TYPE_LABELS[item.voucher_type] || item.voucher_type}
                      </td>
                      <td className="py-2">
                        <input
                          type="text"
                          value={edits.prefix}
                          onChange={(e) => handleNumberingChange(item.voucher_type, "prefix", e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 dark:border-[#282832] px-2 py-1 text-sm focus:border-brand-600 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-blue-500/20"
                        />
                      </td>
                      <td className="py-2">
                        <Select
                          value={String(edits.fy_start_month)}
                          onChange={(v) => handleNumberingChange(item.voucher_type, "fy_start_month", parseInt(v))}
                          options={Array.from({ length: 12 }, (_, i) => ({
                            value: String(i + 1),
                            label: new Date(2000, i).toLocaleString("default", { month: "long" }),
                          }))}
                        />
                      </td>
                      <td className="py-2 text-slate-600 dark:text-[#cbd5e1]">
                        {item.next_sequence}
                      </td>
                      <td className="py-2 font-mono text-xs text-slate-500 dark:text-[#64748b]">
                        {preview}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleResetSequence(item.voucher_type)}
                          className="text-xs text-slate-400 hover:text-red-500 dark:text-[#64748b] dark:hover:text-red-400"
                          title="Reset sequence to 1"
                        >
                          Reset
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <div className="flex items-center gap-3">
          {canManageMembers && (
            <>
              <button onClick={handleSave} disabled={saving}
                className="btn-primary px-6 py-2 text-sm font-medium">
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={handleSaveNumbering} disabled={savingNumbering}
                className="rounded-lg border border-slate-300 dark:border-[#282832] px-6 py-2 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1a1a24] disabled:opacity-50">
                {savingNumbering ? "Saving..." : "Save Voucher Numbering"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
