import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth";
import { api } from "../api/client";
import DateInput from "../components/DateInput";
import { INDIAN_STATES } from "../components/IndianStates";

interface CompanyDetails {
  id: string; name: string; legal_name: string | null; gstin: string | null;
  state_code: string | null; pan: string | null; address: string | null;
  phone: string | null; email: string | null; website: string | null;
  bank_name: string | null; bank_account_number: string | null;
  bank_ifsc: string | null; bank_branch: string | null;
  currency: string; books_begin_from: string | null; is_active: boolean;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm focus:border-brand-600 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-brand-400";
const selectCls = "w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm focus:border-brand-600 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:focus:ring-brand-400";

export default function CompanySettingsPage() {
  const { activeCompanyId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      })
      .finally(() => setLoading(false));
  }, [activeCompanyId]);

  const handleSave = async () => {
    if (!activeCompanyId || !name.trim()) { setError("Company name is required"); return; }
    setError(""); setSuccess(""); setSaving(true);
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
      setSuccess("Company details updated");
    } catch (err: any) {
      setError(err?.detail || "Failed to update company");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>;

  return (
    <div>
      <div className="border-b border-slate-200 dark:border-slate-700 pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Company Settings</h2>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

      <div className="mt-4 grid max-w-3xl gap-5">
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
              <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={selectCls}>
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
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
          <button onClick={handleSave} disabled={saving}
            className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
