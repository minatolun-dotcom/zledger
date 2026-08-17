import { useEffect, useMemo, useState } from "react";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, VoucherSummaryData } from "../types";
import { getLedgerGroupType } from "../types";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import VoucherTemplateModal, { showTemplateModal } from "../../../components/VoucherTemplateModal";
import VoucherFooter from "../shared/VoucherFooter";
import { validateDateInFy, findFyForDate } from "../shared/fyValidation";
import { api } from "../../../api/client";
import { useFyStore } from "../../../store/fy";
interface ContraVoucherFormProps {
  ledgers: Ledger[];
  accountGroups: { id: string; system_code: string | null }[];
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


export default function ContraVoucherForm({
  ledgers,
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
}: ContraVoucherFormProps) {
  const toast = useToastStore();

  // ── Form State ──────────────────────────────────────────────────────
  const [date, setDate] = useState(initialData?.voucher_date || todayIso());
  const [reference, setReference] = useState(initialData?.reference || "");
  const [narration, setNarration] = useState(initialData?.narration || "");

  // Transfer From (source account - will be credited)
  const [fromAccountId, setFromAccountId] = useState("");

  // Transfer To (destination account - will be debited)
  const [toAccountId, setToAccountId] = useState("");

  // Amount
  const [amount, setAmount] = useState<number>(initialData?.amount || 0);

  // Transfer details
  const [transferMode, setTransferMode] = useState("Cash Deposit");
  const [referenceNumber, setReferenceNumber] = useState("");

  // ── Pre-fill from initialData (Create Similar) ─────────────────────
  // similarData arrives AFTER this form mounts (the ?similar= fetch is
  // async), so useState initializers alone are not enough — react to it.
  useEffect(() => {
    if (!initialData || editingVoucher) return;
    if (initialData.narration) setNarration(initialData.narration);
    if (initialData.fromLedgerId) setFromAccountId(initialData.fromLedgerId);
    if (initialData.toLedgerId) setToAccountId(initialData.toLedgerId);
  }, [initialData]);

  // Voucher number
  const [suggestedVoucherNumber, setSuggestedVoucherNumber] = useState("");
  const [customVoucherNumber, setCustomVoucherNumber] = useState("");
  const [localError, setLocalError] = useState("");

  // ── Filter ledgers for cash/bank only ──────────────────────────────
  const groupCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of accountGroups) { if (g.system_code) map.set(g.id, g.system_code); }
    return map;
  }, [accountGroups]);

  const ledgerGroupType = (ledger: Ledger | undefined) => getLedgerGroupType(ledger ? groupCodeMap.get(ledger.group_id) : null);

  // Tally behavior: quick-creating a Transfer From/To account defaults the
  // New Ledger modal's Group to Bank, so the new account always lands in a
  // group this field lists (and thus shows up in the dropdown).
  const bankGroup = useMemo(
    () => accountGroups.find((g) => g.system_code === "GRP_BANK_ACCOUNTS"),
    [accountGroups]
  );

  const cashBankLedgers = useMemo(() => {
    const t = ledgerGroupType;
    return ledgers.filter((l) => { const g = t(l); return g === "cash" || g === "bank"; });
  }, [ledgers, groupCodeMap]);

  const fromLedger = ledgers.find((l) => l.id === fromAccountId);
  const toLedger = ledgers.find((l) => l.id === toAccountId);

  // ── Auto-determine transfer mode ───────────────────────────────────
  useEffect(() => {
    if (!fromAccountId || !toAccountId) return;

    const fromType = ledgerGroupType(fromLedger);
    const toType = ledgerGroupType(toLedger);

    if (fromType === "cash" && toType === "bank") {
      setTransferMode("Cash Deposit");
    } else if (fromType === "bank" && toType === "cash") {
      setTransferMode("Cash Withdrawal");
    } else if (fromType === "bank" && toType === "bank") {
      setTransferMode("Bank Transfer");
    } else {
      setTransferMode("Internal Transfer");
    }
  }, [fromAccountId, toAccountId, fromLedger, toLedger]);

  // ── Populate form from editing voucher ──────────────────────────
  useEffect(() => {
    if (editingVoucher) {
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      setReference(editingVoucher.reference || "");
      const debitLine = editingVoucher.lines.find((l: any) => l.debit > 0);
      const creditLine = editingVoucher.lines.find((l: any) => l.credit > 0);
      setFromAccountId(creditLine?.ledger_id || "");
      setToAccountId(debitLine?.ledger_id || "");
      setAmount(debitLine?.debit || creditLine?.credit || 0);
      
      setReferenceNumber(editingVoucher.reference || "");
      setSuggestedVoucherNumber(editingVoucher.voucher_number || "");
      setCustomVoucherNumber("");
    }
  }, [editingVoucher]);

  // ── Fetch suggested voucher number ─────────────────────────────────
  useEffect(() => {
    if (!editingVoucher) {
      const fyId = useFyStore.getState().activeFyId;
      if (fyId) {
        api
          .get<{ next_number: string }>(`/vouchers/next-number?voucher_type=contra&financial_year_id=${fyId}`)
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
      partyId: "",
      fromLedgerId: fromAccountId,
      toLedgerId: toAccountId,
      amount,
      totalDebit: amount,
      totalCredit: amount,
    });
  }, [amount, fromAccountId, toAccountId, onSummary]);

  // ── Flow data ──────────────────────────────────────────────────────
  useEffect(() => {
    onFlowChange?.({
      voucherType: "contra",
      fromLedgerId: fromAccountId,
      toLedgerId: toAccountId,
      amount,
    });
  }, [fromAccountId, toAccountId, amount, onFlowChange]);

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError?.("");
    setLocalError("");

    if (!fromAccountId) {
      setError?.("Please select 'Transfer From' account");
      return;
    }
    if (!toAccountId) {
      setError?.("Please select 'Transfer To' account");
      return;
    }
    if (fromAccountId === toAccountId) {
      setError?.("Transfer From and Transfer To must be different accounts");
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

    const payload: any = {
      voucher_type: "contra",
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: null,
      lines: [
        // Transfer To → DEBIT (money arrives)
        { ledger_id: toAccountId, debit: amount, credit: 0 },
        // Transfer From → CREDIT (money leaves)
        { ledger_id: fromAccountId, debit: 0, credit: amount },
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
        setFromAccountId("");
        setToAccountId("");
        setAmount(0);
        setTransferMode("Cash Deposit");
        setReferenceNumber("");
        setCustomVoucherNumber("");
      }
    } catch (err: any) {
      setError?.(err?.message || "Failed to save contra voucher");
    }
  };

  // ── Keyboard navigation ────────────────────────────────────────────
  const fieldOrder = ["date", "reference", "from_account", "to_account", "amount", "narration"];
  useVoucherKeyboard({
    fieldOrder,
    onSave: handleSave,
    onReset: () => {
      setDate(todayIso());
      setReference("");
      setNarration("");
      setFromAccountId("");
      setToAccountId("");
      setAmount(0);
      setReferenceNumber("");
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
    const templatePayload: any = {
      voucher_type: "contra",
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: null,
      lines: [
        { ledger_id: toAccountId, debit: amount, credit: 0 },
        { ledger_id: fromAccountId, debit: 0, credit: amount },
      ],
    };
    try {
      await api.post("/recurring-templates", {
        name,
        voucher_type: "contra",
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
      {/* Top: Horizontal voucher info (Date, Voucher No, Transfer From, Transfer To, Amount) */}
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-3">
        <div className="grid grid-cols-1 md:grid-cols-8 gap-4 items-end">
          {/* Date */}
          <div className="max-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
            <DateInput value={date} onChange={setDate} data-field="date" className="w-full" />
          </div>
          {/* Voucher No */}
          <div className="col-span-2">
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
          {/* Transfer From */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Transfer From</label>
            <div data-field="from_account">
              <MasterSelector
                entityKey="ledger"
                value={fromAccountId}
                onChange={(id: string) => setFromAccountId(id)}
                options={cashBankLedgers.map((l) => ({ value: l.id, label: l.name }))}
                placeholder="Select cash / bank..."
                onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
                createDefaults={bankGroup ? { group_id: bankGroup.id } : undefined}
              />
            </div>
          </div>
          {/* Transfer To */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Transfer To</label>
            <div data-field="to_account">
              <MasterSelector
                entityKey="ledger"
                value={toAccountId}
                onChange={(id: string) => setToAccountId(id)}
                options={cashBankLedgers.map((l) => ({ value: l.id, label: l.name }))}
                placeholder="Select cash / bank..."
                onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
                createDefaults={bankGroup ? { group_id: bankGroup.id } : undefined}
              />
            </div>
          </div>
          {/* Amount */}
          <div className="col-span-1">
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
        {/* Transfer Mode & Reference (inline below main fields) */}
        {fromAccountId && toAccountId && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-[#282832]">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Transfer Mode</label>
              <div className="text-sm font-bold text-blue-700 dark:text-blue-400 h-[38px] flex items-center">
                {transferMode}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Reference No.</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="UTR / Cheque # / Txn ID"
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

      {/* Center: Transfer Summary + Narration */}
      <div className="space-y-3">
        {/* Transfer Summary Card */}
        {fromAccountId && toAccountId && amount > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-600 dark:text-[#94a3b8] uppercase tracking-wider mb-1">
                  Transfer Summary
                </div>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-500 dark:text-[#64748b]">From</span>
                  <span className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-semibold">
                    {fromLedger?.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-[#64748b]">To</span>
                  <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-semibold">
                    {toLedger?.name}
                  </span>
                </div>
              </div>
            </div>
          </div>
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
          subtotal={amount}
          discountTotal={0}
          cgstTotal={0}
          sgstTotal={0}
          igstTotal={0}
          grandTotal={amount}
          showItemTotals={false}
          roundOffTo={null}
          onRoundOffChange={() => {}}
          onSave={() => handleSave()}
          isSubmitting={isSubmitting}
          error={displayError}
          isEditing={!!editingVoucher?.id}
          onSaveAsTemplate={() => showTemplateModal("contra", handleSaveAsTemplate)}
        />
      </div>
      <VoucherTemplateModal />
    </div>
  );
}
