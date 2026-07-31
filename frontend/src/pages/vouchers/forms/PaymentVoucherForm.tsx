import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, AccountGroup, VoucherSummaryData } from "../types";
import { getLedgerGroupType } from "../types";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import PartyDetailsPanel from "../shared/PartyDetailsPanel";
import PaymentDetailsPanel from "../shared/PaymentDetailsPanel";
import PayableAllocationTable, { type PayableAllocation } from "../shared/PayableAllocationTable";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import { showTemplateModal } from "../../../components/VoucherTemplateModal";
import { validateDateInFy, findFyForDate } from "../shared/fyValidation";

interface PaymentVoucherFormProps {
  ledgers: Ledger[];
  parties: Party[];
  accountGroups: AccountGroup[];
  onSubmit: (payload: any) => Promise<void>;
  isSubmitting?: boolean;
  error?: string;
  setError?: (msg: string) => void;
  onQuickCreate?: (entityKey: string, item: unknown) => void;
  editingVoucher?: any;
  onUpdate?: (id: string, payload: any) => Promise<void>;
  onFlowChange?: (data: any) => void;
  formScopeRef?: React.RefObject<HTMLDivElement | null>;
  financialYears?: any[];
  setActiveFy?: (id: string | null) => void;
  onSummary?: (data: VoucherSummaryData) => void;
  initialData?: any;
}

const PAYMENT_MODES = ["Cash", "Cheque", "Bank Transfer", "UPI", "RTGS", "NEFT", "IMPS", "DD", "Card"] as const;
const PAID_TO_GROUPS = ["sundry_debtors", "sundry_creditors", "expense", "asset", "liability", "capital", "tax", "other"];
const PAID_FROM_GROUPS = ["cash", "bank"];
export default function PaymentVoucherForm({
  ledgers,
  parties,
  accountGroups,
  onSubmit,
  isSubmitting = false,
  error,
  setError,
  onQuickCreate,
  editingVoucher,
  onUpdate,
  onFlowChange,
  formScopeRef,
  financialYears = [],
  setActiveFy,
  onSummary,
  initialData,
}: PaymentVoucherFormProps) {
  const toast = useToastStore();

  // ── Form State ──────────────────────────────────────────────────────
  const [date, setDate] = useState(initialData?.voucher_date || todayIso());
  const [reference, setReference] = useState(initialData?.reference || "");
  const [narration, setNarration] = useState(initialData?.narration || "");

  // Paid To (supplier/expense/asset/loan ledger)
  const [paidToId, setPaidToId] = useState(initialData?.party_ledger_id || "");
  const [paidToType, setPaidToType] = useState<string | null>(null);

  // Paid From (cash/bank ledger)
  const [paidFromId, setPaidFromId] = useState("");

  // Amount
  const [amount, setAmount] = useState<number>(initialData?.amount || 0);

  // Payment details
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [referenceNumber, setReferenceNumber] = useState("");

  // Bill allocations
  const [allocations, setAllocations] = useState<PayableAllocation[]>([]);
  const [advanceAmount, setAdvanceAmount] = useState(0);

  // Voucher number
  const [suggestedVoucherNumber, setSuggestedVoucherNumber] = useState("");
  const [customVoucherNumber, setCustomVoucherNumber] = useState("");
  const [localError, setLocalError] = useState("");

  // ── Resolve party from Paid To ledger ──────────────────────────────
  const paidToLedger = ledgers.find((l) => l.id === paidToId);
  const party = useMemo(() => {
    if (!paidToId) return null;
    return parties.find((p) => p.ledger_id === paidToId) || null;
  }, [paidToId, parties]);

  const paidFromLedger = ledgers.find((l) => l.id === paidFromId);

  // ── Filter ledgers for selectors ───────────────────────────────────
  const groupCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of accountGroups) { if (g.system_code) map.set(g.id, g.system_code); }
    return map;
  }, [accountGroups]);

  const ledgerGroupType = (ledger: Ledger | undefined) => getLedgerGroupType(ledger ? groupCodeMap.get(ledger.group_id) : null);

  const paidToLedgers = useMemo(() => {
    return ledgers.filter((l) => PAID_TO_GROUPS.includes(ledgerGroupType(l)));
  }, [ledgers, groupCodeMap]);

  const paidFromLedgers = useMemo(() => {
    return ledgers.filter((l) => PAID_FROM_GROUPS.includes(ledgerGroupType(l)));
  }, [ledgers, groupCodeMap]);

  // ── Fetch suggested voucher number ─────────────────────────────────
  useEffect(() => {
    if (editingVoucher?.id) return;
    api
      .get<{ voucher_number: string }>('/vouchers/next-number?voucher_type=payment')
      .then((res) => setSuggestedVoucherNumber(res.voucher_number))
      .catch(() => {});
  }, [editingVoucher]);

  // ── FY validation ──────────────────────────────────────────────────
  useEffect(() => {
    if (financialYears.length === 0) return;
    const fyError = validateDateInFy(financialYears, date);
    if (fyError) {
      setLocalError(fyError);
    } else {
      setLocalError("");
      const fy = findFyForDate(financialYears, date);
      if (fy && setActiveFy) setActiveFy(fy.id);
    }
  }, [date, financialYears, setActiveFy]);

  // ── Summary callback ───────────────────────────────────────────────
  useEffect(() => {
    if (!onSummary) return;
    onSummary({
      itemCount: 0,
      subtotal: amount,
      discountTotal: 0,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      roundOff: null,
      netAmount: amount,
      partyId: party?.id || "",
      fromLedgerId: paidFromId,
      toLedgerId: paidToId,
      amount,
      totalDebit: amount,
      totalCredit: amount,
    });
  }, [amount, party, paidToId, paidFromId, onSummary]);

  // ── Flow data ──────────────────────────────────────────────────────
  useEffect(() => {
    onFlowChange?.({
      paidTo: paidToLedger?.name || null,
      paidFrom: paidFromLedger?.name || null,
      amount,
      allocatedAmount: allocations.reduce((s, a) => s + a.amount, 0),
      advanceAmount,
    });
  }, [paidToId, paidFromId, amount, allocations, advanceAmount, onFlowChange]);

  // ── Allocation callback ────────────────────────────────────────────
  const handleAllocationChange = useCallback(
    (allocs: PayableAllocation[], adv: number) => {
      setAllocations(allocs);
      setAdvanceAmount(adv);
    },
    []
  );

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError?.("");
    setLocalError("");

    if (!paidToId) {
      setError?.("Please select 'Paid To' account");
      return;
    }
    if (!paidFromId) {
      setError?.("Please select 'Paid From' account");
      return;
    }
    if (paidToId === paidFromId) {
      setError?.("Paid To and Paid From cannot be the same");
      return;
    }
    if (amount <= 0) {
      setError?.("Amount must be greater than zero");
      return;
    }

    const fyError = validateDateInFy(financialYears, date);
    if (fyError) {
      setLocalError(fyError);
      return;
    }

    const partyObj = parties.find((p) => p.ledger_id === paidToId);

    const payload: any = {
      voucher_type: "payment",
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: partyObj?.id || null,
      counterparty_gstin: partyObj?.gstin || null,
      counterparty_state_code: partyObj?.state_code || null,
      lines: [
        // Paid To → DEBIT (money goes to supplier/expense)
        { ledger_id: paidToId, debit: amount, credit: 0 },
        // Paid From → CREDIT (money leaves cash/bank)
        { ledger_id: paidFromId, debit: 0, credit: amount },
      ],
    };

    if (!editingVoucher?.id && customVoucherNumber) {
      payload.voucher_number = customVoucherNumber;
    }

    try {
      if (editingVoucher?.id && onUpdate) {
        await onUpdate(editingVoucher.id, payload);
      } else {
        await onSubmit(payload);
        // Reset form after successful save
        setDate(todayIso());
        setReference("");
        setNarration("");
        setPaidToId("");
        setPaidFromId("");
        setAmount(0);
        setPaymentMode("Cash");
        setReferenceNumber("");
        setAllocations([]);
        setAdvanceAmount(0);
        setCustomVoucherNumber("");
      }
    } catch (err: any) {
      setError?.(err?.message || "Failed to save payment");
    }
  };

  // ── Keyboard navigation ────────────────────────────────────────────
  const fieldOrder = ["reference", "date", "paid_to", "paid_from", "amount", "narration"];
  useVoucherKeyboard({
    fieldOrder,
    onSave: handleSave,
    onReset: () => {
      setDate(todayIso());
      setReference("");
      setNarration("");
      setPaidToId("");
      setPaidFromId("");
      setAmount(0);
      setAllocations([]);
      setAdvanceAmount(0);
      setCustomVoucherNumber("");
      setError?.("");
      setLocalError("");
    },
    isSubmitting,
    scopeRef: formScopeRef,
  });

  useEffect(() => {
    focusFirstField(fieldOrder);
  }, []);

  // ── Save as template ───────────────────────────────────────────────
  const handleSaveAsTemplate = async (name: string, frequency: string) => {
    const partyObj = parties.find((p) => p.ledger_id === paidToId);
    const templatePayload: any = {
      voucher_type: "payment",
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: partyObj?.id || null,
      lines: [
        { ledger_id: paidToId, debit: amount, credit: 0 },
        { ledger_id: paidFromId, debit: 0, credit: amount },
      ],
    };
    try {
      await api.post("/recurring-templates", {
        name,
        voucher_type: "payment",
        frequency,
        next_run_date: new Date().toISOString().split(" ")[0],
        template_payload: templatePayload,
      });
      toast.success("Template saved!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save template");
    }
  };

  const displayError = error || localError;
  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
  const isAdvance = advanceAmount > 0;

  return (
    <div className="flex flex-col lg:flex-row lg:flex-wrap gap-5 items-start" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      {/* ── Left Column: Info + Accounts ── */}
      <div className="w-full lg:w-[280px] shrink-0 space-y-4">
        {/* Payment Info */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Payment Info</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
            <DateInput value={date} onChange={setDate} data-field="date" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Payment No.</label>
            <div className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">
              {editingVoucher?.voucher_number || customVoucherNumber || suggestedVoucherNumber || "—"}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Reference</label>
            <div data-field="reference">
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque / UTR / Ref #"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#1a1a24] text-slate-900 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>

        {/* Paid To */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Paid To</h3>
          <div data-field="paid_to">
            <MasterSelector
              entityKey="ledger"
              value={paidToId}
              onChange={(id: string) => {
                setPaidToId(id);
                const ledger = ledgers.find((l) => l.id === id);
                if (ledger) {
                  setPaidToType(ledgerGroupType(ledger));
                } else {
                  setPaidToType(null);
                }
              }}
              options={paidToLedgers.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Select supplier / expense / asset..."
              onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
            />
          </div>
          {party && (paidToType === "sundry_debtors" || paidToType === "sundry_creditors") && (
            <PartyDetailsPanel ledgerId={paidToId} parties={parties} partyId={party.id} />
          )}
        </div>

        {/* Paid From */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Paid From</h3>
          <div data-field="paid_from">
            <MasterSelector
              entityKey="ledger"
              value={paidFromId}
              onChange={(id: string) => setPaidFromId(id)}
              options={paidFromLedgers.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Select cash / bank..."
              onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
            />
          </div>
          {paidFromId && (
            <PaymentDetailsPanel
              ledgerId={paidFromId}
              ledgerName={paidFromLedger?.name}
              paymentMode={paymentMode}
              onPaymentModeChange={setPaymentMode}
              referenceNumber={referenceNumber}
              onReferenceChange={setReferenceNumber}
            />
          )}
        </div>

        {/* Amount */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Amount</h3>
          <div data-field="amount">
            <input
              type="number"
              min={0}
              step={0.01}
              value={amount || ""}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#1a1a24] text-slate-900 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
            />
          </div>
        </div>
      </div>

      {/* ── Center Column: Allocations + Narration ── */}
      <div className="flex-1 min-w-[420px] space-y-4">
        {paidToId && party && (paidToType === "sundry_debtors" || paidToType === "sundry_creditors") && (
          <PayableAllocationTable
            partyLedgerId={paidToId}
            partyName={party.name}
            paymentAmount={amount}
            onAllocationChange={handleAllocationChange}
          />
        )}

        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Narration</h3>
          <textarea
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            rows={3}
            placeholder="Enter payment narration..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#1a1a24] text-slate-900 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none"
          />
        </div>
      </div>

      {/* ── Right Column: Summary + Actions ── */}
      <div className="w-full lg:w-[280px] shrink-0 space-y-4">
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Summary</h3>
          <div className="flex justify-between text-slate-600 dark:text-[#cbd5e1]">
            <span>Payment Amount</span>
            <span className="font-semibold">₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          {allocations.length > 0 && (
            <>
              <div className="flex justify-between text-slate-600 dark:text-[#cbd5e1]">
                <span>Allocated to Bills</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  ₹{totalAllocated.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-slate-200 dark:border-[#282832] pt-2">
                <div className="flex justify-between text-slate-500 dark:text-[#64748b]">
                  <span>Bills</span>
                  <span>{allocations.length}</span>
                </div>
              </div>
            </>
          )}
          {isAdvance && (
            <div className="flex justify-between text-blue-600 dark:text-blue-400 font-medium">
              <span>Advance Payment</span>
              <span>₹{advanceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="border-t border-slate-200 dark:border-[#282832] pt-2">
            <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">
              <span>Total</span>
              <span>₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-lg shadow-lg transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : editingVoucher?.id ? "Update Payment" : "Save Payment"}
          </button>
          <button
            onClick={() => showTemplateModal("payment", handleSaveAsTemplate)}
            className="w-full border border-slate-300 dark:border-[#282832] text-slate-700 dark:text-[#cbd5e1] py-2 rounded-lg text-sm"
          >
            Save Template
          </button>
        </div>

        {displayError && (
          <div className="text-red-500 text-xs font-medium text-center bg-red-50 dark:bg-red-900/10 p-2 rounded border border-red-100 dark:border-red-900/20">
            {displayError}
          </div>
        )}

        {paidFromId && (
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Payment Mode</h3>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                    paymentMode === mode
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-300 dark:border-[#282832] text-slate-600 dark:text-[#94a3b8] hover:border-blue-400"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
