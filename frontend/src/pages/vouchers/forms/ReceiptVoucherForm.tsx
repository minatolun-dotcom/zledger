import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, AccountGroup, VoucherSummaryData } from "../types";
import { LEDGER_GROUP_TYPE_MAP } from "../types";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import PartyDetailsPanel from "../shared/PartyDetailsPanel";
import PaymentDetailsPanel from "../shared/PaymentDetailsPanel";
import InvoiceAllocationTable, { type InvoiceAllocation } from "../shared/InvoiceAllocationTable";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import { showTemplateModal } from "../../../components/VoucherTemplateModal";
import { validateDateInFy, findFyForDate } from "../shared/fyValidation";

interface ReceiptVoucherFormProps {
  ledgers: Ledger[];
  parties: Party[];
  accountGroups: AccountGroup[];
  onSubmit: (payload: any) => Promise<void>;
  isSubmitting?: boolean;
  error?: string;
  setError?: (msg: string) => void;
  onQuickCreate?: (entityKey: string, item: unknown) => void;
  createdFrom?: string;
  editingVoucher?: any;
  onUpdate?: (id: string, payload: any) => Promise<void>;
  onFlowChange?: (data: any) => void;
  formScopeRef?: React.RefObject<HTMLDivElement | null>;
  financialYears?: any[];
  setActiveFy?: (id: string | null) => void;
  onSummary?: (data: VoucherSummaryData) => void;
  initialData?: any;
}

const PAYMENT_MODES = ["Cash", "Cheque", "Bank Transfer", "UPI", "RTGS", "NEFT", "DD", "Card"] as const;

const RECEIVED_FROM_GROUPS = ["sundry_debtors", "sundry_creditors", "income", "asset", "liability", "capital", "other"];
const DEPOSIT_TO_GROUPS = ["cash", "bank"];

export default function ReceiptVoucherForm({
  ledgers,
  parties,
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
}: ReceiptVoucherFormProps) {
  const toast = useToastStore();

  // ── Build groupCodeMap from accountGroups ───────────────────────────
  // ── Form State ──────────────────────────────────────────────────────
  const [date, setDate] = useState(initialData?.voucher_date || todayIso());
  const [reference, setReference] = useState(initialData?.reference || "");
  const [narration, setNarration] = useState(initialData?.narration || "");

  // Received From (party/supplier/income/asset ledger)
  const [receivedFromId, setReceivedFromId] = useState(initialData?.party_ledger_id || "");
  const [receivedFromType, setReceivedFromType] = useState<string | null>(null);

  // Deposit To (cash/bank ledger)
  const [depositToId, setDepositToId] = useState("");

  // Amount
  const [amount, setAmount] = useState<number>(initialData?.amount || 0);

  // Payment details
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [referenceNumber, setReferenceNumber] = useState("");

  // Invoice allocations
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);
  const [advanceAmount, setAdvanceAmount] = useState(0);

  // Voucher number
  const [suggestedVoucherNumber, setSuggestedVoucherNumber] = useState("");
  const [customVoucherNumber, setCustomVoucherNumber] = useState("");
  const [localError, setLocalError] = useState("");

  // ── Resolve party from Received From ledger ─────────────────────────
  const receivedFromLedger = ledgers.find((l) => l.id === receivedFromId);
  const party = useMemo(() => {
    if (!receivedFromId) return null;
    return parties.find((p) => p.ledger_id === receivedFromId) || null;
  }, [receivedFromId, parties]);

  const depositToLedger = ledgers.find((l) => l.id === depositToId);

  // ── Filter ledgers for selectors ───────────────────────────────────
  const receivedFromLedgers = useMemo(() => {
    return ledgers.filter((l) => {
      const groupType = LEDGER_GROUP_TYPE_MAP[l.group_id || ""] || "";
      return RECEIVED_FROM_GROUPS.includes(groupType);
    });
  }, [ledgers]);

  const depositToLedgers = useMemo(() => {
    return ledgers.filter((l) => {
      const groupType = LEDGER_GROUP_TYPE_MAP[l.group_id || ""] || "";
      return DEPOSIT_TO_GROUPS.includes(groupType);
    });
  }, [ledgers]);

  // ── Fetch suggested voucher number ─────────────────────────────────
  useEffect(() => {
    if (editingVoucher?.id) return;
    api
      .get<{ voucher_number: string }>('/vouchers/next-number?voucher_type=receipt')
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
      fromLedgerId: receivedFromId,
      toLedgerId: depositToId,
      amount,
      totalDebit: amount,
      totalCredit: amount,
    });
  }, [amount, party, receivedFromId, depositToId, onSummary]);

  // ── Flow data ──────────────────────────────────────────────────────
  useEffect(() => {
    onFlowChange?.({
      receivedFrom: receivedFromLedger?.name || null,
      depositTo: depositToLedger?.name || null,
      amount,
      allocatedAmount: allocations.reduce((s, a) => s + a.amount, 0),
      advanceAmount,
    });
  }, [receivedFromId, depositToId, amount, allocations, advanceAmount, onFlowChange]);

  // ── Allocation callback ────────────────────────────────────────────
  const handleAllocationChange = useCallback(
    (allocs: InvoiceAllocation[], adv: number) => {
      setAllocations(allocs);
      setAdvanceAmount(adv);
    },
    []
  );

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError?.("");
    setLocalError("");

    if (!receivedFromId) {
      setError?.("Please select 'Received From' account");
      return;
    }
    if (!depositToId) {
      setError?.("Please select 'Deposit To' account");
      return;
    }
    if (receivedFromId === depositToId) {
      setError?.("Received From and Deposit To cannot be the same");
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

    const partyObj = parties.find((p) => p.ledger_id === receivedFromId);

    const payload: any = {
      voucher_type: "receipt",
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: partyObj?.id || null,
      counterparty_gstin: partyObj?.gstin || null,
      counterparty_state_code: partyObj?.state_code || null,
      lines: [
        // Deposit To → DEBIT (money goes into cash/bank)
        { ledger_id: depositToId, debit: amount, credit: 0 },
        // Received From → CREDIT (money comes from customer/supplier)
        { ledger_id: receivedFromId, debit: 0, credit: amount },
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
        setReceivedFromId("");
        setDepositToId("");
        setAmount(0);
        setPaymentMode("Cash");
        setReferenceNumber("");
        setAllocations([]);
        setAdvanceAmount(0);
        setCustomVoucherNumber("");
      }
    } catch (err: any) {
      setError?.(err?.message || "Failed to save receipt");
    }
  };

  // ── Keyboard navigation ────────────────────────────────────────────
  const fieldOrder = ["reference", "date", "received_from", "deposit_to", "amount", "narration"];
  useVoucherKeyboard({
    fieldOrder,
    onSave: handleSave,
    onReset: () => {
      setDate(todayIso());
      setReference("");
      setNarration("");
      setReceivedFromId("");
      setDepositToId("");
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
    const partyObj = parties.find((p) => p.ledger_id === receivedFromId);
    const templatePayload: any = {
      voucher_type: "receipt",
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: partyObj?.id || null,
      lines: [
        { ledger_id: depositToId, debit: amount, credit: 0 },
        { ledger_id: receivedFromId, debit: 0, credit: amount },
      ],
    };
    try {
      await api.post("/recurring-templates", {
        name,
        voucher_type: "receipt",
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
    <div className="flex flex-col lg:flex-row gap-5 items-start" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      {/* ── Left Column: Info + Accounts ── */}
      <div className="w-full lg:w-[280px] shrink-0 space-y-4">
        {/* Invoice Info */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Receipt Info</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
            <DateInput value={date} onChange={setDate} data-field="date" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Receipt No.</label>
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

        {/* Received From */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Received From</h3>
          <div data-field="received_from">
            <MasterSelector
              entityKey="ledger"
              value={receivedFromId}
              onChange={(id: string) => {
                setReceivedFromId(id);
                const ledger = ledgers.find((l) => l.id === id);
                if (ledger) {
                  setReceivedFromType(LEDGER_GROUP_TYPE_MAP[ledger.group_id || ""] || null);
                } else {
                  setReceivedFromType(null);
                }
              }}
              options={receivedFromLedgers.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Select customer / supplier..."
              onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
            />
          </div>
          {party && (receivedFromType === "sundry_debtors" || receivedFromType === "sundry_creditors") && (
            <PartyDetailsPanel ledgerId={receivedFromId} parties={parties} partyId={party.id} />
          )}
        </div>

        {/* Deposit To */}
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Deposit To</h3>
          <div data-field="deposit_to">
            <MasterSelector
              entityKey="ledger"
              value={depositToId}
              onChange={(id: string) => setDepositToId(id)}
              options={depositToLedgers.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="Select cash / bank..."
              onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
            />
          </div>
          {depositToId && (
            <PaymentDetailsPanel
              ledgerId={depositToId}
              ledgerName={depositToLedger?.name}
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
      <div className="flex-1 min-w-0 space-y-4">
        {receivedFromId && party && (receivedFromType === "sundry_debtors" || receivedFromType === "sundry_creditors") && (
          <InvoiceAllocationTable
            partyLedgerId={receivedFromId}
            partyName={party.name}
            receiptAmount={amount}
            onAllocationChange={handleAllocationChange}
          />
        )}

        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Narration</h3>
          <textarea
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            rows={3}
            placeholder="Enter receipt narration..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#1a1a24] text-slate-900 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none"
          />
        </div>
      </div>

      {/* ── Right Column: Summary + Actions ── */}
      <div className="w-full lg:w-[280px] shrink-0 space-y-4">
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Summary</h3>
          <div className="flex justify-between text-slate-600 dark:text-[#cbd5e1]">
            <span>Receipt Amount</span>
            <span className="font-semibold">₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          {allocations.length > 0 && (
            <>
              <div className="flex justify-between text-slate-600 dark:text-[#cbd5e1]">
                <span>Allocated to Invoices</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  ₹{totalAllocated.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="border-t border-slate-200 dark:border-[#282832] pt-2">
                <div className="flex justify-between text-slate-500 dark:text-[#64748b]">
                  <span>Invoices</span>
                  <span>{allocations.length}</span>
                </div>
              </div>
            </>
          )}
          {isAdvance && (
            <div className="flex justify-between text-blue-600 dark:text-blue-400 font-medium">
              <span>Advance Receipt</span>
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
            {isSubmitting ? "Saving..." : editingVoucher?.id ? "Update Receipt" : "Save Receipt"}
          </button>
          <button
            onClick={() => showTemplateModal("receipt", handleSaveAsTemplate)}
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

        {depositToId && (
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
