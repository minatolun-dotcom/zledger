import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, AccountGroup, VoucherSummaryData } from "../types";
import { getLedgerGroupType } from "../types";
import { partyByLedgerMap, ledgerOptionLabel } from "../shared/ledgerUtils";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import Select from "../../../components/Select";
import PayableAllocationTable, { type PayableAllocation } from "../shared/PayableAllocationTable";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import { showTemplateModal } from "../../../components/VoucherTemplateModal";
import VoucherFooter from "../shared/VoucherFooter";
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

  // Advance amount from bill allocation (displayed in footer)
  const [advanceAmount, setAdvanceAmount] = useState(0);

  // ── Allocation callback ────────────────────────────────────────────
  const handleAllocationChange = useCallback(
    (_allocs: PayableAllocation[], adv: number) => {
      setAdvanceAmount(adv);
    },
    []
  );
  // Voucher number
  const [suggestedVoucherNumber, setSuggestedVoucherNumber] = useState("");
  const [customVoucherNumber, setCustomVoucherNumber] = useState("");
  const [localError, setLocalError] = useState("");

  // ── Resolve party from Paid To ledger ──────────────────────────────
  const party = useMemo(() => {
    if (!paidToId) return null;
    return parties.find((p) => p.ledger_id === paidToId) || null;
  }, [paidToId, parties]);
  const partyByLedger = useMemo(() => partyByLedgerMap(parties), [parties]);

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

  // ── Populate form from editing voucher ──────────────────────────
  useEffect(() => {
    if (editingVoucher) {
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      setReference(editingVoucher.reference || "");
      const debitLine = editingVoucher.lines.find((l: any) => l.debit > 0);
      const creditLine = editingVoucher.lines.find((l: any) => l.credit > 0);
      setPaidToId(debitLine?.ledger_id || "");
      setPaidFromId(creditLine?.ledger_id || "");
      setAmount(debitLine?.debit || creditLine?.credit || 0);
      setPaymentMode(editingVoucher.payment_mode || "Cash");
      setReferenceNumber(editingVoucher.reference || "");
      setSuggestedVoucherNumber(editingVoucher.voucher_number || "");
      setCustomVoucherNumber("");
    }
  }, [editingVoucher]);

  // ── Fetch suggested voucher number ─────────────────────────────────
  useEffect(() => {
    if (!editingVoucher) {
      const fyId = localStorage.getItem("zledger.fyId");
      if (fyId) {
        api
          .get<{ next_number: string }>(`/vouchers/next-number?voucher_type=payment&financial_year_id=${fyId}`)
          .then((res) => setSuggestedVoucherNumber(res.next_number))
          .catch((err) => { console.error("Failed to fetch voucher number:", err); });
      }
    }
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
      voucherType: "payment",
      fromLedgerId: paidFromId,
      toLedgerId: paidToId,
      amount,
    });
  }, [paidToId, paidFromId, amount, onFlowChange]);

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


  return (
    <div className="space-y-3" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      {/* Top: Horizontal voucher info (Date, Voucher No, Paid To, Paid From, Amount) */}
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          {/* Date */}
          <div className="max-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
            <DateInput value={date} onChange={setDate} data-field="date" className="w-full" />
          </div>
          {/* Voucher No */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Voucher No.</label>
            <input
              type="text"
              value={customVoucherNumber}
              onChange={(e) => setCustomVoucherNumber(e.target.value)}
              placeholder={suggestedVoucherNumber || "Auto"}
              className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16] text-slate-800 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-[#64748b] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
              data-field="voucher_number"
            />
          </div>
          {/* Paid To */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Paid To</label>
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
                options={paidToLedgers.map((l) => ({ value: l.id, label: ledgerOptionLabel(l, partyByLedger) }))}
                placeholder="Select supplier / expense..."
                onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
              />
            </div>
          </div>
          {/* Paid From */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Paid From</label>
            <div data-field="paid_from">
              <MasterSelector
                entityKey="ledger"
                value={paidFromId}
                onChange={(id: string) => setPaidFromId(id)}
                options={paidFromLedgers.map((l) => ({ value: l.id, label: ledgerOptionLabel(l, partyByLedger) }))}
                placeholder="Select cash / bank..."
                onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
              />
            </div>
          </div>
          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Amount</label>
            <div data-field="amount">
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount || ""}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#3a3a45] bg-white dark:bg-[#1a1a24] text-slate-900 dark:text-[#f1f5f9]"
              />
            </div>
          </div>
        </div>
        {/* Payment Mode & Reference (inline below main fields) */}
        {paidFromId && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-[#282832]">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Payment Mode</label>
              <Select
                value={paymentMode}
                onChange={(v) => setPaymentMode(v)}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Reference No.</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Cheque / UTR / Ref #"
                className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a24]"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Notes / Reference</label>
              <div data-field="reference">
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Additional notes or reference"
                  className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a24]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Center: Bill Allocations + Narration */}
      <div className="space-y-3">
        {paidToId && party && (paidToType === "sundry_debtors" || paidToType === "sundry_creditors") && (
          <PayableAllocationTable
            partyLedgerId={paidToId}
            partyName={party.name}
            paymentAmount={amount}
            onAllocationChange={handleAllocationChange}
          />
        )}
        <div data-field="narration">
          <textarea
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="Narration..."
            rows={4}
            className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg p-2 bg-white dark:bg-[#1a1a24]"
          />
        </div>
        {/* Footer with action buttons */}
        <VoucherFooter
          subtotal={advanceAmount}
          discountTotal={0}
          cgstTotal={0}
          sgstTotal={0}
          igstTotal={0}
          grandTotal={advanceAmount}
          showItemTotals={false}
          roundOffTo={null}
          onRoundOffChange={() => {}}
          onSave={handleSave}
          isSubmitting={isSubmitting}
          error={displayError}
          isEditing={!!editingVoucher?.id}
          onSaveAsTemplate={() => showTemplateModal("payment", handleSaveAsTemplate)}
        />
      </div>
    </div>
  );
}
