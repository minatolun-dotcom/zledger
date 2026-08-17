import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useFyStore } from "../store/fy";
import { useToastStore } from "../store/toast";
import { api, setCompanyId } from "../api/client";
import { generateFyName, calculateEndDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import Select from "../components/Select";
import { INDIAN_STATES } from "../components/IndianStates";
import Modal from "../components/Modal";
import RestoreBackupModal from "../components/RestoreBackupModal";
import { MODULES } from "../config/modules";
import ModuleSelector from "../components/ModuleSelector";
import AuthShell, { AuthBrandMark } from "../components/AuthShell";

export default function CompanySelectPage() {
  const { user, companies, fetchMe, setActiveCompany, activeCompanyId, logout, meError } = useAuthStore();
  const { setActiveFy } = useFyStore();
  const toast = useToastStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(searchParams.get("create") === "true");
  const [showRestore, setShowRestore] = useState(false);
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [fyStart, setFyStart] = useState("");
  const [fyEnd, setFyEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>(MODULES.map((m) => m.id));
  const [companyType, setCompanyType] = useState("");

  // Whether user is already inside a company (switch mode vs initial choose)
  const isSwitchMode = !!activeCompanyId;

  // Close on Escape when in switch mode (but not if a Select dropdown is open)
  useEffect(() => {
    if (!isSwitchMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const selectOpen = document.querySelector('[role="listbox"]');
        if (selectOpen) return;
        // If the create form is open, close it instead of closing the whole overlay
        if (showCreate) { setShowCreate(false); return; }
        navigate(-1);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isSwitchMode, navigate, showCreate]);

  // Auto-set end date to day before start date in next year
  const handleStartDateChange = (value: string) => {
    setFyStart(value);
    if (value) {
      setFyEnd(calculateEndDate(value));
    } else {
      setFyEnd("");
    }
  };

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const handleSelect = (id: string) => {
    setActiveFy(null);
    setActiveCompany(id);
    navigate("/");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!fyStart || !fyEnd) {
      toast.error("Financial year is required");
      return;
    }
    if (fyEnd < fyStart) {
      toast.error("Financial year end date cannot be before start date");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { name };
      if (gstin) payload.gstin = gstin;
      if (stateCode) payload.state_code = stateCode;
      payload.modules = selectedModules;
      const co = await api.post<{ id: string }>("/companies", payload);
      // Write company ID to localStorage for X-Company-Id header on the
      // FY call below, but delay the zustand update (setActiveCompany)
      // until after FY creation. Otherwise setActiveCompany flips
      // isSwitchMode → true and re-renders the component into the
      // switch overlay mid-flow, disrupting the create sequence.
      setCompanyId(co.id);

      const fyName = generateFyName(fyStart);
      const fy = await api.post<{ id: string }>("/coa/financial-years", {
        name: fyName, start_date: fyStart, end_date: fyEnd,
      });
      setActiveFy(fy.id);

      // Now safe to update the store — navigate("/") follows immediately.
      setActiveCompany(co.id);
      navigate("/");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  /* ── Shared building blocks ── */

  const retryFetchMe = () => { fetchMe(); };

  const companyList = (compact: boolean) => (
    <>
      {meError && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-sm text-red-700 dark:text-red-400">
            Couldn't load your companies — {meError}
          </p>
          <button onClick={retryFetchMe}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/20">
            Retry
          </button>
        </div>
      )}
      {companies.length > 0 && (
        <div className={`${compact ? "" : "mt-6 "}space-y-2`}>
          {companies.map((co) => (
            <button key={co.id} onClick={() => handleSelect(co.id)}
              className={`group w-full rounded-xl border px-4 py-3 text-left transition-all duration-150 hover:-translate-y-px ${
                co.id === activeCompanyId
                  ? "border-blue-500 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10"
                  : "border-slate-200 hover:border-brand-600 hover:bg-brand-50 dark:border-[#1a1a24] dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10"
              }`}>
              <div className="flex items-center gap-3">
                {co.logo_url ? (
                  <img src={co.logo_url} alt={co.name} className="h-8 w-8 shrink-0 rounded object-contain" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900 dark:text-[#f1f5f9]">{co.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]">{co.role}</span>
                    {co.id === activeCompanyId && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">current</span>
                    )}
                  </span>
                </div>
                <svg className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-[#475569]" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {companies.length === 0 && !showCreate && !meError && (
        <div className="space-y-3">
          <button onClick={() => setShowCreate(true)}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-brand-600 hover:text-brand-600 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:border-blue-500/50 dark:hover:text-blue-400">
            + Create your first company
          </button>
          <button onClick={() => setShowRestore(true)}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-green-600 hover:text-green-600 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:border-green-500/50 dark:hover:text-green-400">
            <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Restore from backup
          </button>
        </div>
      )}

      {companies.length > 0 && !showCreate && (
        <button onClick={() => setShowCreate(true)}
          className={`${compact ? "" : "mt-6 "}w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-brand-600 hover:text-brand-600 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:border-blue-500/50 dark:hover:text-blue-400`}>
          + Create new company
        </button>
      )}
    </>
  );

  // Small section header used by the create form cards
  const sectionHeader = (icon: ReactNode, title: string, hint: string) => (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-[#1a1a24] dark:text-[#94a3b8]">
        {icon}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-[#f1f5f9]">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-[#94a3b8]">{hint}</p>
      </div>
    </div>
  );

  const createForm = (
    <form onSubmit={handleCreate} className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 id="csp-new-company-title" className="text-base font-semibold text-slate-900 dark:text-[#f1f5f9]">New Company</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[#94a3b8]">
            Books, ledgers and a financial year are created for you.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
          Back
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Company Details card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-[#1a1a24] dark:bg-[#0f0f16]/60">
          {sectionHeader(
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>,
            "Company Details",
            "Legal identity of the entity."
          )}
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Company name *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                autoFocus
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-[#282832] dark:bg-[#0f0f16] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">GSTIN</label>
                <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27AAAAA1111A1Z5"
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-[#282832] dark:bg-[#0f0f16] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20" />
              </div>
              <div>
                <Select
                  value={stateCode}
                  onChange={setStateCode}
                  options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }))}
                  label="State"
                  placeholder="Select state"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Financial Year card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-[#1a1a24] dark:bg-[#0f0f16]/60">
          {sectionHeader(
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>,
            "Financial Year",
            "Start date — end date is auto-calculated."
          )}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">Start Date *</label>
              <DateInput value={fyStart} onChange={handleStartDateChange} required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-[#cbd5e1]">End Date</label>
              <DateInput value={fyEnd} onChange={(v) => setFyEnd(v)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-[#282832] dark:bg-[#0f0f16]" />
            </div>
          </div>
          {fyStart && fyEnd && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              FY: {generateFyName(fyStart)}
            </div>
          )}
        </div>
      </div>

      {/* Modules card */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-[#1a1a24] dark:bg-[#0f0f16]/60">
        {sectionHeader(
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>,
          "Modules",
          "Pick the feature set — you can change this later in Company Settings."
        )}
        <div className="mt-3">
          <ModuleSelector
            selectedModules={selectedModules}
            onModulesChange={setSelectedModules}
            companyType={companyType}
            onCompanyTypeChange={setCompanyType}
            showHeading={false}
          />
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-[#1a1a24]">
        <button type="button" onClick={() => setShowCreate(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
          Cancel
        </button>
        <button type="submit" disabled={loading}
          className="btn-primary px-5 py-2 text-sm font-medium">
          {loading ? "Creating..." : "Create company"}
        </button>
      </div>
    </form>
  );

  // Switch mode: render as branded overlay with close on backdrop click.
  // Portal into document.body so the fixed backdrop is outside any
  // stacking-context containers in the React tree and covers the
  // full viewport including the top area.
  if (isSwitchMode) {
    return (
      <Modal
        open
        onClose={() => navigate(-1)}
        maxWidth="3xl"
        scrollable
        closeOnEscape={false}
        panelClassName="rounded-2xl p-6"
        label={showCreate ? "New Company" : "Switch Company"}
        ariaLabelledBy={showCreate ? "csp-new-company-title" : "csp-switch-company-title"}
      >
          {/* Brand mark — consistent with login hero. Only for the list view;
              the create form carries its own header (New Company / Back). */}
          {!showCreate && (
            <div className="mb-4 flex items-center gap-3">
              <AuthBrandMark size="sm" />
              <div className="flex-1">
                <h1 id="csp-switch-company-title" className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">Switch Company</h1>
                <p className="text-sm text-slate-500 dark:text-[#cbd5e1]">Signed in as {user?.name}</p>
              </div>
              <button onClick={() => navigate(-1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
                Close
              </button>
            </div>
          )}

          {!showCreate ? companyList(true) : createForm}
      </Modal>
    );
  }

  // Initial choose mode: full branded page (AuthShell hero + company list)
  return (
    <AuthShell
      title={showCreate ? "New Company" : "Select Company"}
      subtitle={
        showCreate
          ? "Set up a new entity — books and ledgers are created for you."
          : `Signed in as ${user?.name}`
      }
      footer={
        <button onClick={logout} className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
          Sign out
        </button>
      }
      wide={showCreate}
    >
      {showCreate ? createForm : companyList(false)}

      {showRestore && <RestoreBackupModal onClose={() => setShowRestore(false)} />}
    </AuthShell>
  );
}
