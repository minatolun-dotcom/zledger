import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useFyStore } from "../store/fy";
import { api } from "../api/client";
import { generateFyName, calculateEndDate } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import { INDIAN_STATES } from "../components/IndianStates";

export default function CompanySelectPage() {
  const { user, companies, fetchMe, setActiveCompany, logout } = useAuthStore();
  const { setActiveFy } = useFyStore();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [fyStart, setFyStart] = useState("");
  const [fyEnd, setFyEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    setActiveCompany(id);
    navigate("/");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!fyStart || !fyEnd) {
      setError("Financial year is required");
      return;
    }
    if (fyEnd < fyStart) {
      setError("Financial year end date cannot be before start date");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, string> = { name };
      if (gstin) payload.gstin = gstin;
      if (stateCode) payload.state_code = stateCode;
      const co = await api.post<{ id: string }>("/companies", payload);
      setActiveCompany(co.id);

      const fyName = generateFyName(fyStart);
      const fy = await api.post<{ id: string }>("/coa/financial-years", {
        name: fyName, start_date: fyStart, end_date: fyEnd,
      });
      setActiveFy(fy.id);

      navigate("/");
    } catch (err: any) {
      setError(err?.detail || err.message || "Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:shadow-slate-800/50 dark:ring-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Select Company</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Signed in as {user?.name}</p>
          </div>
          <button onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700/50">
            Sign out
          </button>
        </div>

        {companies.length > 0 && (
          <div className="mt-6 space-y-2">
            {companies.map((co) => (
              <button key={co.id} onClick={() => handleSelect(co.id)}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:hover:border-brand-400 dark:hover:bg-brand-900/30">
                <span className="font-medium text-slate-900 dark:text-slate-100">{co.name}</span>
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-400">{co.role}</span>
              </button>
            ))}
          </div>
        )}

        {!showCreate ? (
          <button onClick={() => setShowCreate(true)}
            className="mt-6 w-full rounded-lg border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-brand-600 hover:text-brand-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-400">
            + Create new company
          </button>
        ) : (
          <form onSubmit={handleCreate} className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New Company</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Company name *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-slate-600 dark:focus:border-brand-400 dark:focus:ring-brand-400" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">GSTIN</label>
                <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27AAAAA1111A1Z5"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-slate-600 dark:focus:border-brand-400 dark:focus:ring-brand-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">State</label>
                <select value={stateCode} onChange={(e) => setStateCode(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 dark:border-slate-600 dark:focus:border-brand-400 dark:focus:ring-brand-400">
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Financial Year *</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Select the start date — end date is auto-calculated.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Start Date *</label>
                  <DateInput value={fyStart} onChange={handleStartDateChange} required
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">End Date</label>
                  <DateInput value={fyEnd} onChange={(v) => setFyEnd(v)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600" />
                </div>
              </div>
              {fyStart && fyEnd && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">FY Name: {generateFyName(fyStart)}</p>
              )}
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {loading ? "Creating..." : "Create company"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700/50">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
