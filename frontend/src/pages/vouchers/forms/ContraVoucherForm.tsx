import { useEffect, useMemo, useState } from "react";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, VoucherSummaryData } from "../types";
import { getLedgerGroupType } from "../types";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import { showTemplateModal } from "../../../components/VoucherTemplateModal";
import { validateDateInFy, findFyForDate } from "../shared/fyValidation";
import { api } from "../../../api/client";
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

  // ── Fetch suggested voucher number ─────────────────────────────────
  useEffect(() => {
    if (editingVoucher?.id) return;
    api
      .get<{ voucher_number: string }>('/vouchers/next-number?voucher_type=contra')
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
      transferFrom: fromLedger?.name || null,
      transferTo: toLedger?.name || null,
      amount,
      mode: transferMode,
    });
  }, [fromAccountId, toAccountId, amount, transferMode, onFlowChange, fromLedger, toLedger]);

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
    <div className="flex flex-col lg:flex-row lg:flex-wrap gap-5 items-start" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      {/* ── Left Column: Info + Accounts ── */}
      <div className="w-full lg:w-[280px] shrink-0 space-y-4">
        {/* Transfer Info */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Transfer Info</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
            <DateInput value={date} onChange={setDate} data-field="date" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Voucher No.</label>
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

        {/* Transfer From */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Transfer From</h3>
          <div data-field="from_account">
            <MasterSelector
              entityKey="ledger"
              value={fromAccountId}
              onChange={(id: string) => setFromAccountId(id)}
              options={cashBankLedgers.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Select cash / bank..."
              onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
            />
          </div>
          {fromAccountId && (
            <div className="text-xs text-slate-600 dark:text-[#94a3b8]">
              <span className="font-medium">{fromLedger?.name}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-[10px] font-semibold">
                SOURCE
              </span>
            </div>
          )}
        </div>

        {/* Transfer To */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Transfer To</h3>
          <div data-field="to_account">
            <MasterSelector
              entityKey="ledger"
              value={toAccountId}
              onChange={(id: string) => setToAccountId(id)}
              options={cashBankLedgers.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Select cash / bank..."
              onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
            />
          </div>
          {toAccountId && (
            <div className="text-xs text-slate-600 dark:text-[#94a3b8]">
              <span className="font-medium">{toLedger?.name}</span>
              <span className="ml-2 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[10px] font-semibold">
                DESTINATION
              </span>
            </div>
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

      {/* ── Center Column: Narration + Transfer Mode ── */}
      <div className="flex-1 min-w-[420px] space-y-4">
        {/* Transfer Mode Display */}
        {fromAccountId && toAccountId && (
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-600 dark:text-[#94a3b8] uppercase tracking-wider mb-1">
                  Transfer Mode
                </div>
                <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{transferMode}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-[#64748b]">From</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">{fromLedger?.name}</div>
                <div className="text-xs text-slate-500 dark:text-[#64748b] mt-1">To</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">{toLedger?.name}</div>
              </div>
            </div>
          </div>
        )}

        {/* Narration */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Narration</h3>
          <textarea
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            rows={4}
            placeholder="Enter transfer narration..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#1a1a24] text-slate-900 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none"
          />
        </div>

        {/* Reference Number (optional) */}
        {toAccountId && fromAccountId && (
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">
              Transaction Details
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#94a3b8] mb-1">
                Reference Number
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="UTR / Cheque # / Transaction ID"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#1a1a24] text-slate-900 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Right Column: Summary + Actions ── */}
      <div className="w-full lg:w-[280px] shrink-0 space-y-4">
        {/* Summary */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-slate-600 dark:text-[#cbd5e1]">
              <span>Transfer Amount</span>
              <span className="font-semibold">₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {fromAccountId && (
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>From</span>
                <span className="font-medium">{fromLedger?.name}</span>
              </div>
            )}
            {toAccountId && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <span>To</span>
                <span className="font-medium">{toLedger?.name}</span>
              </div>
            )}
          </div>
          <div className="border-t border-slate-200 dark:border-[#282832] pt-2">
            <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">
              <span>Total</span>
              <span>₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-lg shadow-lg transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : editingVoucher?.id ? "Update Contra" : "Save Contra"}
          </button>
          <button
            onClick={() => showTemplateModal("contra", handleSaveAsTemplate)}
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

        {/* Transfer Mode Info */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-slate-50 dark:bg-[#1a1a24] p-3">
          <h4 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] mb-2">Transfer Types</h4>
          <div className="space-y-1 text-[10px] text-slate-600 dark:text-[#94a3b8]">
            <div>• Cash → Bank = Deposit</div>
            <div>• Bank → Cash = Withdrawal</div>
            <div>• Bank → Bank = Transfer</div>
          </div>
        </div>
      </div>
    </div>
  );
}
