import StatusBadge from "../components/StatusBadge";
import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import { toDisplayDate, todayIso } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import Select from "../components/Select";
import Tabs from "../components/Tabs";
import TabContent from "../components/TabContent";
import { showConfirm } from "../components/ConfirmDialog";
import { ListSkeleton } from "./skeletons";
import { useSearchParams } from "react-router-dom";
import useEscapeToClose from "../hooks/useEscapeToClose";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface Loan {
  id: string; company_id: string; loan_type: string; party_name: string;
  party_ledger_id: string | null; loan_ledger_id: string | null;
  principal_amount: number; interest_rate: number; interest_type: string;
  disbursement_date: string; due_date: string | null;
  emi_amount: number; tenure_months: number | null;
  status: string; outstanding_balance: number; accrued_interest: number;
  disbursement_voucher_id: string | null; notes: string | null;
  created_at: string; updated_at: string;
}

interface LoanPayment {
  id: string; loan_id: string; company_id: string; payment_date: string;
  total_amount: number; interest_portion: number; principal_portion: number;
  is_manual_interest: boolean; voucher_id: string | null;
  notes: string | null; created_at: string;
}

interface LoanSummary {
  total_given: number; total_taken: number; total_advances: number;
  outstanding_given: number; outstanding_taken: number; outstanding_advances: number;
  overdue_count: number; accrued_interest_income: number; accrued_interest_expense: number;
}

interface LedgerOption { id: string; name: string; }

type Tab = "given" | "taken" | "advances" | "summary";

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const loanTypeLabels: Record<string, string> = { given: "Loans Given", taken: "Loans Taken", employee_advance: "Employee Advances" };
const interestTypeLabels: Record<string, string> = { simple: "Simple", compound: "Compound", none: "None" };

/* ── LoansPage ─────────────────────────────────────────────────────────── */

export default function LoansPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "given";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToastStore();
  const [search, setSearch] = useState("");

  // Create/Edit loan modal
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [loanForm, setLoanForm] = useState({
    loan_type: "given", party_name: "", principal_amount: 0,
    interest_rate: 0, interest_type: "simple",
    disbursement_date: todayIso(), due_date: "", emi_amount: 0,
    tenure_months: 0, bank_ledger_id: "", notes: "",
  });
  const [bankLedgers, setBankLedgers] = useState<LedgerOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payingLoan, setPayingLoan] = useState<Loan | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    total_amount: 0, payment_date: todayIso(), bank_ledger_id: "",
    is_manual_interest: false, interest_portion: 0, notes: "",
  });
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Detail modal
  const [detailLoan, setDetailLoan] = useState<Loan | null>(null);
  const [detailPayments, setDetailPayments] = useState<LoanPayment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEscapeToClose(showLoanModal, () => setShowLoanModal(false));
  useEscapeToClose(showPaymentModal, () => { setShowPaymentModal(false); setPayingLoan(null); });
  useEscapeToClose(!!detailLoan, () => setDetailLoan(null));

  /* ── Data loading ──────────────────────────────────────────────────── */

  const loadLoans = useCallback(async () => {
    setLoading(true);
    try {
      const [loansRes, summaryRes] = await Promise.all([
        api.get<{ items: Loan[]; total: number }>("/loans"),
        api.get<LoanSummary>("/loans/summary"),
      ]);
      setLoans(loansRes.items);
      setSummary(summaryRes);
    } catch {
      useToastStore.getState().error("Failed to load loans");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBankLedgers = useCallback(async () => {
    try {
      const res = await api.get<Array<{ id: string; name: string }> | { items: Array<{ id: string; name: string }> }>("/coa/ledgers");
      const items: Array<{ id: string; name: string }> = Array.isArray(res) ? res : (res as any).items ?? [];
      const bankCash = items.filter((l: { id: string; name: string }) => /bank|cash/i.test(l.name));
      setBankLedgers(bankCash.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadLoans(); loadBankLedgers(); }, [loadLoans, loadBankLedgers]);

  useEffect(() => {
    const t = searchParams.get("tab") as Tab;
    if (t && ["given", "taken", "advances", "summary"].includes(t)) setTab(t);
  }, [searchParams]);

  const handleTabChange = (t: string) => {
    setTab(t as Tab);
    setSearchParams({ tab: t });
  };

  useEffect(() => {
    if (searchParams.get("action") === "new") {
      openCreateModal();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  /* ── Filtered loans ────────────────────────────────────────────────── */

  const filtered = loans.filter((l) => {
    if (tab === "given") return l.loan_type === "given";
    if (tab === "taken") return l.loan_type === "taken";
    if (tab === "advances") return l.loan_type === "employee_advance";
    return true;
  }).filter((l) => !search || l.party_name.toLowerCase().includes(search.toLowerCase()));

  /* ── Modal helpers ─────────────────────────────────────────────────── */

  function openCreateModal() {
    setEditingLoan(null);
    setLoanForm({
      loan_type: tab === "taken" ? "taken" : tab === "advances" ? "employee_advance" : "given",
      party_name: "", principal_amount: 0, interest_rate: 0, interest_type: "simple",
      disbursement_date: todayIso(), due_date: "", emi_amount: 0, tenure_months: 0,
      bank_ledger_id: bankLedgers[0]?.id ?? "", notes: "",
    });
    setShowLoanModal(true);
  }

  function openEditModal(loan: Loan) {
    setEditingLoan(loan);
    setLoanForm({
      loan_type: loan.loan_type, party_name: loan.party_name,
      principal_amount: loan.principal_amount, interest_rate: loan.interest_rate,
      interest_type: loan.interest_type, disbursement_date: loan.disbursement_date,
      due_date: loan.due_date ?? "", emi_amount: loan.emi_amount,
      tenure_months: loan.tenure_months ?? 0, bank_ledger_id: "",
      notes: loan.notes ?? "",
    });
    setShowLoanModal(true);
  }

  async function submitLoan() {
    if (!loanForm.party_name || !loanForm.principal_amount) {
      toast.error("Party name and principal amount are required");
      return;
    }
    if (!loanForm.bank_ledger_id) {
      toast.error("Please select a bank/cash ledger");
      return;
    }
    setSubmitting(true);
    try {
      if (editingLoan) {
        await api.patch(`/loans/${editingLoan.id}`, {
          party_name: loanForm.party_name,
          interest_rate: loanForm.interest_rate,
          interest_type: loanForm.interest_type,
          due_date: loanForm.due_date || null,
          emi_amount: loanForm.emi_amount,
          tenure_months: loanForm.tenure_months || null,
          notes: loanForm.notes || null,
        });
        toast.success("Loan updated");
      } else {
        await api.post("/loans", {
          ...loanForm,
          due_date: loanForm.due_date || null,
          emi_amount: loanForm.emi_amount || 0,
          tenure_months: loanForm.tenure_months || null,
          notes: loanForm.notes || null,
        });
        toast.success("Loan created — disbursement voucher auto-created");
      }
      setShowLoanModal(false);
      loadLoans();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to save loan");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteLoan(loan: Loan) {
    const ok = await showConfirm(`Delete loan to "${loan.party_name}"? This will cancel the disbursement voucher.`);
    if (!ok) return;
    try {
      await api.del(`/loans/${loan.id}`);
      toast.success("Loan deleted");
      loadLoans();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to delete loan");
    }
  }

  /* ── Payment modal ─────────────────────────────────────────────────── */

  function openPaymentModal(loan: Loan) {
    setPayingLoan(loan);
    setPaymentForm({
      total_amount: loan.emi_amount || 0, payment_date: todayIso(),
      bank_ledger_id: bankLedgers[0]?.id ?? "",
      is_manual_interest: false, interest_portion: 0, notes: "",
    });
    setShowPaymentModal(true);
  }

  async function submitPayment() {
    if (!payingLoan || !paymentForm.total_amount) return;
    if (!paymentForm.bank_ledger_id) {
      toast.error("Please select a bank/cash ledger");
      return;
    }
    setPaySubmitting(true);
    try {
      await api.post(`/loans/${payingLoan.id}/payments`, {
        total_amount: paymentForm.total_amount,
        payment_date: paymentForm.payment_date,
        bank_ledger_id: paymentForm.bank_ledger_id,
        is_manual_interest: paymentForm.is_manual_interest,
        interest_portion: paymentForm.is_manual_interest ? paymentForm.interest_portion : undefined,
        notes: paymentForm.notes || null,
      });
      toast.success("Payment recorded — voucher auto-created");
      setShowPaymentModal(false);
      loadLoans();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to record payment");
    } finally {
      setPaySubmitting(false);
    }
  }

  /* ── Detail modal ──────────────────────────────────────────────────── */

  async function openDetail(loan: Loan) {
    setDetailLoan(loan);
    setDetailPayments([]);
    setShowPaymentModal(false);
    setDetailLoading(true);
    try {
      const detail = await api.get<Loan>(`/loans/${loan.id}`);
      const pays = await api.get<LoanPayment[]>(`/loans/${loan.id}/payments`);
      setDetailLoan(detail);
      setDetailPayments(pays);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to load loan details");
    } finally {
      setDetailLoading(false);
    }
  }

  /* ── Render ────────────────────────────────────────────────────────── */

  const tabs = [
    { key: "given", label: "Loans Given" },
    { key: "taken", label: "Loans Taken" },
    { key: "advances", label: "Employee Advances" },
    { key: "summary", label: "Summary" },
  ];

  const fmtDate = (d: string) => {
    try { return toDisplayDate(d); } catch { return d; }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && tab !== "summary" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Given", value: fmt(summary.total_given), color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Outstanding", value: fmt(summary.outstanding_given + summary.outstanding_taken + summary.outstanding_advances), color: "text-amber-600 dark:text-amber-400" },
            { label: "Overdue", value: String(summary.overdue_count), color: summary.overdue_count > 0 ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-[#94a3b8]" },
            { label: "Accrued Interest", value: fmt(summary.accrued_interest_income - summary.accrued_interest_expense), color: "text-blue-600 dark:text-blue-400" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 dark:text-[#64748b]">{c.label}</p>
              <p className={`mt-1 text-lg font-semibold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + actions */}
      <div className="flex items-center justify-between">
        <Tabs tabs={tabs} active={tab} onChange={handleTabChange} />
        {tab !== "summary" && (
          <button onClick={openCreateModal} className="ml-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 whitespace-nowrap">
            + New
          </button>
        )}
      </div>

      <TabContent activeKey={tab}>
        {/* Summary tab */}
        {tab === "summary" && summary && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { title: "Loans Given", principal: summary.total_given, outstanding: summary.outstanding_given, interest: summary.accrued_interest_income },
                { title: "Loans Taken", principal: summary.total_taken, outstanding: summary.outstanding_taken, interest: summary.accrued_interest_expense },
                { title: "Employee Advances", principal: summary.total_advances, outstanding: summary.outstanding_advances, interest: 0 },
              ].map((s) => (
                <div key={s.title} className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">{s.title}</h3>
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-[#64748b]">Principal</span>
                      <span className="font-medium text-slate-700 dark:text-[#f1f5f9]">{fmt(s.principal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-[#64748b]">Outstanding</span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">{fmt(s.outstanding)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-[#64748b]">Accrued Interest</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">{fmt(s.interest)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {summary.overdue_count > 0 && (
              <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">{summary.overdue_count} loan(s) are overdue</p>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        {tab !== "summary" && (
          <input
            type="text"
            placeholder="Search by party name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] placeholder-slate-400 dark:placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}

        {/* Loans table */}
        {tab !== "summary" && (
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm overflow-hidden">
            {loading ? (
              <ListSkeleton rows={5} cols={6} />
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-[#64748b]">
                No {loanTypeLabels[tab === "given" ? "given" : tab === "taken" ? "taken" : "employee_advance"].toLowerCase()} found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-[#1a1a24]">
                  <thead className="bg-slate-50 dark:bg-[#1a1a24]">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b] min-w-[150px]">Party</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b] w-[130px]">Principal</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b] w-[130px]">Outstanding</th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b] w-[120px]">Interest</th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b] w-[90px]">Status</th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b] w-[120px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1a1a24]">
                    {filtered.map((loan) => (
                      <tr key={loan.id} className="hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors">
                        <td className="px-4 py-3 max-w-[200px]">
                          <button onClick={() => openDetail(loan)} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate block max-w-[180px]" title={loan.party_name}>
                            {loan.party_name}
                          </button>
                          <p className="text-xs text-slate-400 dark:text-[#64748b] whitespace-nowrap">{fmtDate(loan.disbursement_date)}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-[#f1f5f9] whitespace-nowrap tabular-nums">{fmt(loan.principal_amount)}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap tabular-nums">{fmt(loan.outstanding_balance)}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="text-xs text-blue-600 dark:text-blue-400">{interestTypeLabels[loan.interest_type]}</span>
                          <span className="text-xs text-slate-400 dark:text-[#64748b] ml-1">{loan.interest_rate}%</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={loan.status} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {loan.status !== "closed" && (
                              <button onClick={() => openPaymentModal(loan)} className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20 whitespace-nowrap">
                                Pay
                              </button>
                            )}
                            <button onClick={() => openEditModal(loan)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-[#94a3b8] dark:hover:bg-[#282832] whitespace-nowrap">
                              Edit
                            </button>
                            <button onClick={() => deleteLoan(loan)} className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 whitespace-nowrap">
                              Del
                            </button>
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
      </TabContent>

      {/* ── Loan Modal ────────────────────────────────────────────────── */}
      {showLoanModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLoanModal(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#16161f] shadow-xl border border-slate-200 dark:border-[#282832] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">{editingLoan ? "Edit Loan" : "New Loan / Advance"}</h2>
              <button onClick={() => setShowLoanModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#cbd5e1]">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {!editingLoan && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Loan Type</label>
                  <Select
                    value={loanForm.loan_type}
                    onChange={(v) => setLoanForm({ ...loanForm, loan_type: v })}
                    options={[
                      { value: "given", label: "Loan Given" },
                      { value: "taken", label: "Loan Taken" },
                      { value: "employee_advance", label: "Employee Advance" },
                    ]}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Party Name *</label>
                <input type="text" value={loanForm.party_name} onChange={(e) => setLoanForm({ ...loanForm, party_name: e.target.value })}
                  autoFocus
                  className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {!editingLoan && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Principal Amount *</label>
                    <input type="number" value={loanForm.principal_amount || ""} onChange={(e) => setLoanForm({ ...loanForm, principal_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">EMI Amount</label>
                    <input type="number" value={loanForm.emi_amount || ""} onChange={(e) => setLoanForm({ ...loanForm, emi_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Interest Rate (%)</label>
                  <input type="number" step="0.5" value={loanForm.interest_rate || ""} onChange={(e) => setLoanForm({ ...loanForm, interest_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Interest Type</label>
                  <Select
                    value={loanForm.interest_type}
                    onChange={(v) => setLoanForm({ ...loanForm, interest_type: v })}
                    options={[{ value: "simple", label: "Simple" }, { value: "compound", label: "Compound" }, { value: "none", label: "None" }]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Disbursement Date</label>
                  <DateInput value={loanForm.disbursement_date} onChange={(v) => setLoanForm({ ...loanForm, disbursement_date: v })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Due Date</label>
                  <DateInput value={loanForm.due_date} onChange={(v) => setLoanForm({ ...loanForm, due_date: v })} />
                </div>
              </div>
              {!editingLoan && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Bank / Cash Ledger *</label>
                  <Select
                    value={loanForm.bank_ledger_id}
                    onChange={(v) => setLoanForm({ ...loanForm, bank_ledger_id: v })}
                    options={bankLedgers.map((l) => ({ value: l.id, label: l.name }))}
                    placeholder="Select bank/cash..."
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Notes</label>
                <textarea rows={2} value={loanForm.notes} onChange={(e) => setLoanForm({ ...loanForm, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-[#1a1a24] px-6 py-4">
              <button onClick={() => setShowLoanModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832]">Cancel</button>
              <button onClick={submitLoan} disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? "Saving..." : editingLoan ? "Update" : "Create Loan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ─────────────────────────────────────────────── */}
      {showPaymentModal && payingLoan && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#16161f] shadow-xl border border-slate-200 dark:border-[#282832] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">Record Payment</h2>
                <p className="text-xs text-slate-500 dark:text-[#64748b]">{payingLoan.party_name} — Outstanding: {fmt(payingLoan.outstanding_balance)}</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#cbd5e1]">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Payment Amount *</label>
                  <input type="number" value={paymentForm.total_amount || ""} onChange={(e) => setPaymentForm({ ...paymentForm, total_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Payment Date</label>
                  <DateInput value={paymentForm.payment_date} onChange={(v) => setPaymentForm({ ...paymentForm, payment_date: v })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Bank / Cash Ledger *</label>
                <Select
                  value={paymentForm.bank_ledger_id}
                  onChange={(v) => setPaymentForm({ ...paymentForm, bank_ledger_id: v })}
                  options={bankLedgers.map((l) => ({ value: l.id, label: l.name }))}
                  placeholder="Select bank/cash..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-[#f1f5f9]">
                <input type="checkbox" checked={paymentForm.is_manual_interest}
                  onChange={(e) => setPaymentForm({ ...paymentForm, is_manual_interest: e.target.checked })}
                  className="rounded border-slate-300 dark:border-[#282832] text-indigo-600 focus:ring-indigo-500" />
                Manual interest split
              </label>
              {paymentForm.is_manual_interest && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-[#64748b] mb-1">Interest Portion</label>
                  <input type="number" value={paymentForm.interest_portion || ""} onChange={(e) => setPaymentForm({ ...paymentForm, interest_portion: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#1a1a24] px-3 py-2 text-sm text-slate-900 dark:text-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <p className="mt-1 text-xs text-slate-400 dark:text-[#64748b]">Principal: {fmt(paymentForm.total_amount - paymentForm.interest_portion)}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-[#1a1a24] px-6 py-4">
              <button onClick={() => setShowPaymentModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94a3b8] hover:bg-slate-100 dark:hover:bg-[#282832]">Cancel</button>
              <button onClick={submitPayment} disabled={paySubmitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {paySubmitting ? "Recording..." : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ──────────────────────────────────────────────── */}
      {detailLoan && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDetailLoan(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#16161f] shadow-xl border border-slate-200 dark:border-[#282832] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">{detailLoan.party_name}</h2>
                <p className="text-xs text-slate-500 dark:text-[#64748b]">{loanTypeLabels[detailLoan.loan_type] ?? detailLoan.loan_type}</p>
              </div>
              <button onClick={() => setDetailLoan(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-[#cbd5e1]">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Principal", value: fmt(detailLoan.principal_amount) },
                  { label: "Outstanding", value: fmt(detailLoan.outstanding_balance) },
                  { label: "Accrued Interest", value: fmt(detailLoan.accrued_interest) },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg bg-slate-50 dark:bg-[#1a1a24] p-3 text-center">
                    <p className="text-xs text-slate-500 dark:text-[#64748b]">{m.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">{m.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#64748b]">Interest: </span><span className="font-medium text-slate-700 dark:text-[#f1f5f9]">{interestTypeLabels[detailLoan.interest_type]} @ {detailLoan.interest_rate}%</span></div>
                <div><span className="text-slate-500 dark:text-[#64748b]">Disbursed: </span><span className="font-medium text-slate-700 dark:text-[#f1f5f9]">{fmtDate(detailLoan.disbursement_date)}</span></div>
                {detailLoan.due_date && <div><span className="text-slate-500 dark:text-[#64748b]">Due: </span><span className="font-medium text-slate-700 dark:text-[#f1f5f9]">{fmtDate(detailLoan.due_date)}</span></div>}
                <div><span className="text-slate-500 dark:text-[#64748b]">EMI: </span><span className="font-medium text-slate-700 dark:text-[#f1f5f9]">{fmt(detailLoan.emi_amount)}</span></div>
              </div>

              {/* Payments */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-[#f1f5f9] mb-2">Payment History</h3>
                {detailLoading ? (
                  <ListSkeleton rows={2} cols={4} />
                ) : detailPayments.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-[#64748b]">No payments recorded yet.</p>
                ) : (
                  <div className="rounded-lg border border-slate-200 dark:border-[#1a1a24] overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-[#1a1a24]">
                      <thead className="bg-slate-50 dark:bg-[#1a1a24]">
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500 dark:text-[#64748b] w-[120px]">Date</th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-slate-500 dark:text-[#64748b] w-[120px]">Total</th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-slate-500 dark:text-[#64748b] w-[120px]">Interest</th>
                          <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-slate-500 dark:text-[#64748b] w-[120px]">Principal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#1a1a24]">
                        {detailPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-[#1a1a24]">
                            <td className="px-3 py-2 text-sm text-slate-700 dark:text-[#f1f5f9] whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                            <td className="px-3 py-2 text-right text-sm font-medium text-slate-700 dark:text-[#f1f5f9] whitespace-nowrap tabular-nums">{fmt(p.total_amount)}</td>
                            <td className="px-3 py-2 text-right text-sm text-blue-600 dark:text-blue-400 whitespace-nowrap tabular-nums">{fmt(p.interest_portion)}</td>
                            <td className="px-3 py-2 text-right text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap tabular-nums">{fmt(p.principal_portion)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
