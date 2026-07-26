import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useFyStore } from "../store/fy";
import { useToastStore } from "../store/toast";
import { api, setCompanyId } from "../api/client";
import { generateFyName, calculateEndDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import Select from "../components/Select";
import { INDIAN_STATES } from "../components/IndianStates";
import RestoreBackupModal from "../components/RestoreBackupModal";
import { MODULES } from "../config/modules";
import ModuleSelector from "../components/ModuleSelector";

export default function CompanySelectPage() {
  const { user, companies, fetchMe, setActiveCompany, activeCompanyId, logout } = useAuthStore();
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

  // Switch mode: render as overlay with close on backdrop click.
  // Portal into document.body so the fixed backdrop is outside any
  // stacking-context containers in the React tree and covers the
  // full viewport including the top area.
  if (isSwitchMode) {
    return createPortal(
      <>
        <div className={`fixed top-0 left-0 right-0 bottom-0 z-[99999] bg-black/50${showCreate ? "" : " backdrop-blur-sm"}`}
          onClick={() => navigate(-1)} />
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-6"
          onClick={() => navigate(-1)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200 dark:bg-[#16161f] dark:shadow-dark-xl dark:ring-[#1a1a24] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
          {!showCreate && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">Switch Company</h1>
                  <p className="mt-1 text-sm text-slate-500 dark:text-[#cbd5e1]">Signed in as {user?.name}</p>
                </div>
                <button onClick={() => navigate(-1)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
                  Close
                </button>
              </div>

              {companies.length > 0 && (
                <div className="mt-6 space-y-2">
                  {companies.map((co) => (
                    <button key={co.id} onClick={() => handleSelect(co.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
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
                        <div>
                          <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{co.name}</span>
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]">{co.role}</span>
                          {co.id === activeCompanyId && (
                            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">current</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button onClick={() => setShowCreate(true)}
                  className="flex-1 rounded-lg border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-brand-600 hover:text-brand-600 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:border-blue-500/50 dark:hover:text-blue-400">
                  + Create new company
                </button>
              </div>
            </>
          )}

          {showCreate && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">New Company</h2>
                <button type="button" onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
                  Back
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Company name *</label>
                <input required value={name} onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-[#282832] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">GSTIN</label>
                  <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27AAAAA1111A1Z5"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-[#282832] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20" />
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
              <div className="border-t border-slate-200 pt-4 dark:border-[#1a1a24]">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Financial Year *</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-[#cbd5e1]">Select the start date — end date is auto-calculated.</p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Start Date *</label>
                    <DateInput value={fyStart} onChange={handleStartDateChange} required
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#282832]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">End Date</label>
                    <DateInput value={fyEnd} onChange={(v) => setFyEnd(v)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#282832]" />
                  </div>
                </div>
                {fyStart && fyEnd && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-[#cbd5e1]">FY Name: {generateFyName(fyStart)}</p>
                )}
              </div>
              <div className="border-t border-slate-200 pt-4 dark:border-[#1a1a24]">
                <ModuleSelector
                  selectedModules={selectedModules}
                  onModulesChange={setSelectedModules}
                  companyType={companyType}
                  onCompanyTypeChange={setCompanyType}
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={loading}
                  className="btn-primary px-4 py-2 text-sm font-medium">
                  {loading ? "Creating..." : "Create company"}
                </button>
                <button type="button" onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
        </div>
      </>,
      document.body
    );
  }

  // Initial choose mode: full page, no close option
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200 dark:bg-[#16161f] dark:shadow-dark-xl dark:ring-[#1a1a24]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">Select Company</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#cbd5e1]">Signed in as {user?.name}</p>
          </div>
          <button onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
            Sign out
          </button>
        </div>

        {companies.length > 0 && (
          <div className="mt-6 space-y-2">
            {companies.map((co) => (
              <button key={co.id} onClick={() => handleSelect(co.id)}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-brand-600 hover:bg-brand-50 dark:border-[#1a1a24] dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10">
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
                  <div>
                    <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{co.name}</span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]">{co.role}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {companies.length === 0 && !showCreate && (
          <div className="mt-6 space-y-3">
            <button onClick={() => setShowCreate(true)}
              className="w-full rounded-lg border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-brand-600 hover:text-brand-600 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:border-blue-500/50 dark:hover:text-blue-400">
              + Create your first company
            </button>
            <button onClick={() => setShowRestore(true)}
              className="w-full rounded-lg border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-green-600 hover:text-green-600 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:border-green-500/50 dark:hover:text-green-400">
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Restore from backup
            </button>
          </div>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">New Company</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">Company name *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-[#282832] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">GSTIN</label>
                <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27AAAAA1111A1Z5"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-[#282832] dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20" />
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

            <div className="border-t border-slate-200 pt-4 dark:border-[#1a1a24]">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Financial Year *</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-[#cbd5e1]">Select the start date — end date is auto-calculated.</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">Start Date *</label>
                  <DateInput value={fyStart} onChange={handleStartDateChange} required
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#282832]" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">End Date</label>
                  <DateInput value={fyEnd} onChange={(v) => setFyEnd(v)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#282832]" />
                </div>
              </div>
              {fyStart && fyEnd && (
                <p className="mt-2 text-xs text-slate-500 dark:text-[#cbd5e1]">FY Name: {generateFyName(fyStart)}</p>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4 dark:border-[#1a1a24]">
              <ModuleSelector
                selectedModules={selectedModules}
                onModulesChange={setSelectedModules}
                companyType={companyType}
                onCompanyTypeChange={setCompanyType}
              />
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="btn-primary px-4 py-2 text-sm font-medium">
                {loading ? "Creating..." : "Create company"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:bg-[#1a1a24]">
                Cancel
              </button>
            </div>
          </form>
        )}

        {companies.length > 0 && !showCreate && (
          <button onClick={() => setShowCreate(true)}
            className="mt-6 w-full rounded-lg border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-brand-600 hover:text-brand-600 dark:border-[#282832] dark:text-[#cbd5e1] dark:hover:border-blue-500/50 dark:hover:text-blue-400">
            + Create new company
          </button>
        )}
      </div>

      {showRestore && <RestoreBackupModal onClose={() => setShowRestore(false)} />}
    </div>
  );
}
