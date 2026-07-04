import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api/client";
import { useFyStore } from "../store/fy";
import { generateFyName, calculateEndDate, toDisplayDate } from "../utils/dateUtils";
import { DashboardSkeleton } from "./skeletons";
import DateInput from "../components/DateInput";
import VoucherList from "./vouchers/VoucherList";
import type { Voucher } from "./vouchers/types";
import { VOUCHER_TYPES } from "./vouchers/types";

interface FinancialYear { id: string; name: string; start_date: string; end_date: string; is_closed: boolean; }

interface DashboardData {
  financial_year_id: string; financial_year_name: string;
  total_income: number; total_expenses: number; net_profit: number; is_profit: boolean;
  total_assets: number; total_liabilities: number;
  voucher_count: number; sales_count: number; purchase_count: number;
  receipt_count: number; payment_count: number; journal_count: number;
  recent_vouchers: { id: string; voucher_type: string; voucher_number: string; voucher_date: string; narration: string | null; }[];
  ledger_count: number; party_count: number; group_count: number; gst_registration_count: number;
}

interface CompanyDetails {
  id: string; name: string; gstin: string | null; legal_name: string | null;
  state_code: string | null; is_active: boolean; logo_url: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-[#1e1e28] dark:bg-[#18181f]">
      <p className="text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color || "text-slate-900"} dark:text-[#f1f5f9]`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-[#94a3b8]">{sub}</p>}
    </div>
  );
}

function CountBadge({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-[#1e1e28] dark:bg-[#18181f]/80">
      <span className="text-sm text-slate-600 dark:text-[#94a3b8]">{label}</span>
      <span className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">{count}</span>
    </div>
  );
}

export default function DashboardContent() {
  const { companyDetails, logoVersion } = useOutletContext<{ companyDetails: CompanyDetails | null; logoVersion: number }>();
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFyForm, setShowFyForm] = useState(false);
  const [fyStart, setFyStart] = useState("");
  const [fyEnd, setFyEnd] = useState("");
  const [fyError, setFyError] = useState("");
  const { activeFyId, setActiveFy } = useFyStore();
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);

  // Auto-set end date to day before start date in next year
  const handleStartDateChange = (value: string) => {
    setFyStart(value);
    if (value) {
      setFyEnd(calculateEndDate(value));
    } else {
      setFyEnd("");
    }
  };

  const loadFys = () => {
    api.get<FinancialYear[]>("/coa/financial-years").then((fys) => {
      setFys(fys);
      // Auto-select if nothing selected, or if stored FY doesn't belong to this company
      if (fys.length > 0 && (!activeFyId || !fys.some((f) => f.id === activeFyId))) {
        const latest = fys[fys.length - 1];
        setActiveFy(latest.id);
      } else if (fys.length === 0) {
        setActiveFy(null);
      }
    });
  };

  useEffect(() => { loadFys(); }, []);

  useEffect(() => {
    if (!activeFyId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    api.get<DashboardData>(`/dashboard/summary?financial_year_id=${activeFyId}`)
      .then(setData)
      .catch(() => { if (!controller.signal.aborted) setData(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeFyId]);

  useEffect(() => {
    setVouchersLoading(true);
    api.get<Voucher[]>("/vouchers")
      .then(setVouchers)
      .catch(() => setVouchers([]))
      .finally(() => setVouchersLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedVoucher) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedVoucher(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedVoucher]);

  const handleCreateFy = async () => {
    if (!fyStart || !fyEnd) { setFyError("Start and end dates are required"); return; }
    if (fyEnd < fyStart) { setFyError("End date cannot be before start date"); return; }
    setFyError("");
    try {
      const fyName = generateFyName(fyStart);
      const fy = await api.post<FinancialYear>("/coa/financial-years", {
        name: fyName, start_date: fyStart, end_date: fyEnd,
      });
      setActiveFy(fy.id);
      setShowFyForm(false);
      setFyStart(""); setFyEnd("");
      loadFys();
    } catch (err: any) {
      setFyError(err?.detail || "Failed to create financial year");
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (!activeFyId || fys.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-[#252530] dark:bg-[#18181f]">
        <h3 className="text-lg font-semibold text-slate-700 dark:text-[#cbd5e1]">Welcome to Zledger</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-[#94a3b8]">
          {fys.length === 0
            ? "Create a Financial Year to get started."
            : "Select a Financial Year from the sidebar dropdown."}
        </p>
        {fys.length === 0 && !showFyForm && (
          <button onClick={() => setShowFyForm(true)}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Create Financial Year
          </button>
        )}
        {showFyForm && (
          <div className="mx-auto mt-4 max-w-sm text-left">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-[#1e1e28] dark:bg-[#18181f]">
              <h4 className="mb-3 font-semibold text-slate-800 dark:text-[#f1f5f9]">New Financial Year</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Start Date *</label>
                    <DateInput value={fyStart} onChange={handleStartDateChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#252530]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">End Date *</label>
                    <DateInput value={fyEnd} onChange={(v) => setFyEnd(v)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#252530]" />
                  </div>
                </div>
                {fyStart && fyEnd && (
                  <p className="text-xs text-slate-500 dark:text-[#94a3b8]">FY Name: {generateFyName(fyStart)}</p>
                )}
              </div>
              {fyError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fyError}</p>}
              <div className="mt-4 flex gap-2">
                <button onClick={handleCreateFy}
                  className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                  Create
                </button>
                <button onClick={() => { setShowFyForm(false); setFyError(""); }}
                  className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-[#252530] dark:text-[#94a3b8] dark:hover:bg-[#1e1e28]">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!data) return <p className="text-sm text-slate-500 dark:text-[#94a3b8]">No data available.</p>;

  const voucherTypes = [
    { label: "Sales", count: data.sales_count, color: "text-emerald-600" },
    { label: "Purchase", count: data.purchase_count, color: "text-blue-600" },
    { label: "Receipt", count: data.receipt_count, color: "text-violet-600" },
    { label: "Payment", count: data.payment_count, color: "text-rose-600" },
    { label: "Journal", count: data.journal_count, color: "text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <div className="flex items-center gap-3">
          {companyDetails?.logo_url && (
            <img
              src={`${companyDetails.logo_url}${companyDetails.logo_url.includes("?") ? "&" : "?"}v=${logoVersion}`}
              alt={companyDetails.name}
              className="h-6 w-6 rounded object-contain"
            />
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Dashboard</h2>
            {companyDetails?.name && (
              <p className="text-xs text-slate-500 dark:text-[#94a3b8]">Welcome to {companyDetails.name}</p>
            )}
          </div>
        </div>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Income" value={`₹${fmt(data.total_income)}`} color="text-emerald-700 dark:text-emerald-400" />
        <StatCard label="Total Expenses" value={`₹${fmt(data.total_expenses)}`} color="text-red-600 dark:text-red-400" />
        <StatCard
          label={data.is_profit ? "Net Profit" : "Net Loss"}
          value={`₹${fmt(Math.abs(data.net_profit))}`}
          color={data.is_profit ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}
        />
        <StatCard label="Total Assets" value={`₹${fmt(data.total_assets)}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Voucher Stats */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-[#1e1e28] dark:bg-[#18181f]">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Vouchers ({data.voucher_count} total)</h3>
          <div className="space-y-2">
            {voucherTypes.map((v) => (
              <CountBadge key={v.label} label={v.label} count={v.count} />
            ))}
          </div>
        </div>

        {/* Entity Counts */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-[#1e1e28] dark:bg-[#18181f]">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Masters</h3>
          <div className="space-y-2">
            <CountBadge label="Ledgers" count={data.ledger_count} />
            <CountBadge label="Parties" count={data.party_count} />
            <CountBadge label="Account Groups" count={data.group_count} />
            <CountBadge label="GST Registrations" count={data.gst_registration_count} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-[#1e1e28] dark:bg-[#18181f]">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Quick Actions</h3>
          <div className="space-y-2">
            <button onClick={() => navigate("/vouchers")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1e1e28] dark:text-[#cbd5e1] dark:hover:bg-[#1e1e28]">
               + Create Voucher
             </button>
             <button onClick={() => navigate("/reports")}
               className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1e1e28] dark:text-[#cbd5e1] dark:hover:bg-[#1e1e28]">
               View Reports
             </button>
             <button onClick={() => navigate("/compliance")}
               className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1e1e28] dark:text-[#cbd5e1] dark:hover:bg-[#1e1e28]">
               GST Compliance
             </button>
             <button onClick={() => navigate("/chart-of-accounts")}
               className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1e1e28] dark:text-[#cbd5e1] dark:hover:bg-[#1e1e28]">
              Manage Accounts
            </button>
          </div>
        </div>
      </div>

      {/* Recent Vouchers */}
      <VoucherList
        vouchers={vouchers}
        loading={vouchersLoading}
        filterType={filterType}
        onFilterChange={setFilterType}
        onClick={(id) => {
          const v = vouchers.find((v) => v.id === id);
          if (v) setSelectedVoucher(v);
        }}
      />

      {/* Voucher Detail Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-10 pb-10" onClick={(e) => { if (e.target === e.currentTarget) setSelectedVoucher(null); }}>
          <div className="relative w-full max-w-2xl rounded-xl bg-white dark:bg-[#18181f] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                {VOUCHER_TYPES.find((t) => t.id === selectedVoucher.voucher_type)?.label || selectedVoucher.voucher_type}
                {" — "}
                {selectedVoucher.voucher_number}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/vouchers?v=${selectedVoucher.id}`)}
                  className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#1e1e28]"
                >
                  Open in Vouchers
                </button>
                <button onClick={() => setSelectedVoucher(null)} className="rounded border border-slate-300 dark:border-[#252530] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-50 dark:hover:bg-[#1e1e28]">Close</button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Date</span>
                  <p className="mt-0.5 text-slate-900 dark:text-[#f1f5f9]">{toDisplayDate(selectedVoucher.voucher_date)}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Type</span>
                  <p className="mt-0.5">
                    <span className="inline-block rounded bg-slate-100 dark:bg-[#252530] px-1.5 py-0.5 text-[11px] font-medium capitalize text-slate-600 dark:text-[#94a3b8]">
                      {VOUCHER_TYPES.find((t) => t.id === selectedVoucher.voucher_type)?.shortLabel || selectedVoucher.voucher_type}
                    </span>
                  </p>
                </div>
                {selectedVoucher.party_name && (
                  <div>
                    <span className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Party</span>
                    <p className="mt-0.5 text-slate-900 dark:text-[#f1f5f9]">{selectedVoucher.party_name}</p>
                  </div>
                )}
                {selectedVoucher.cancelled_at && (
                  <div>
                    <span className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Status</span>
                    <p className="mt-0.5 text-red-600 dark:text-red-400 font-medium">Cancelled</p>
                  </div>
                )}
                {selectedVoucher.narration && (
                  <div className="col-span-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Narration</span>
                    <p className="mt-0.5 text-slate-900 dark:text-[#f1f5f9]">{selectedVoucher.narration}</p>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] p-4 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600 dark:text-[#94a3b8]">
                  <span>Subtotal</span>
                  <span>₹{selectedVoucher.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                {selectedVoucher.discount_total > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-[#94a3b8]">
                    <span>Discount</span>
                    <span className="text-red-600 dark:text-red-400">-₹{selectedVoucher.discount_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {selectedVoucher.tax_total > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-[#94a3b8]">
                    <span>Tax</span>
                    <span>₹{selectedVoucher.tax_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 dark:border-[#1e1e28] pt-2 font-semibold text-slate-900 dark:text-[#f1f5f9]">
                  <span>Grand Total</span>
                  <span>₹{selectedVoucher.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
