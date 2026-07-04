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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 dark:border-[#252530] px-3 py-1.5 text-sm focus:border-brand-600 dark:focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-violet-500/20";

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

  if (loading) return <ListSkeleton title="Company Settings" cols={2} rows={3} />;

  return (
    <div>
      <div className="border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Company Settings</h2>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 grid max-w-3xl gap-5">
        <Section title="Company Logo">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-[#252530] bg-slate-50 dark:bg-[#0a0a0f] overflow-hidden">
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
                    className="rounded-lg border border-slate-300 dark:border-[#252530] px-4 py-1.5 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#1e1e28] disabled:opacity-50">
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
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-3 gap-4">
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
          <div className="grid grid-cols-3 gap-4">
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
          <div className="grid grid-cols-2 gap-4">
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

        <div>
          {canManageMembers && (
            <button onClick={handleSave} disabled={saving}
              className="btn-primary px-6 py-2 text-sm font-medium">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
