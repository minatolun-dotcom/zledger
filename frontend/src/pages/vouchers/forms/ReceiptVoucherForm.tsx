import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, AccountGroup, VoucherSummaryData } from "../types";
import { getLedgerGroupType } from "../types";
import { partyByLedgerMap, ledgerOptionLabel } from "../shared/ledgerUtils";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import PartyDetailsPanel from "../shared/PartyDetailsPanel";
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
}: ReceiptVoucherFormProps) {
  const toast = useToastStore();

  // ── Build groupCodeMap from accountGroups ───────────────────────────
  const groupCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of accountGroups) { if (g.system_code) map.set(g.id, g.system_code); }
    return map;
  }, [accountGroups]);

  const ledgerGroupType = (ledger: Ledger | undefined) => getLedgerGroupType(ledger ? groupCodeMap.get(ledger.group_id) : null);
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
  const partyByLedger = useMemo(() => partyByLedgerMap(parties), [parties]);


  // ── Filter ledgers for selectors ───────────────────────────────────
  const receivedFromLedgers = useMemo(() => {
    return ledgers.filter((l) => RECEIVED_FROM_GROUPS.includes(ledgerGroupType(l)));
  }, [ledgers, groupCodeMap]);

  const depositToLedgers = useMemo(() => {
    return ledgers.filter((l) => DEPOSIT_TO_GROUPS.includes(ledgerGroupType(l)));
  }, [ledgers, groupCodeMap]);

  // ── Fetch suggested voucher number ─────────────────────────────────
  useEffect(() => {
    if (!editingVoucher) {
      const fyId = localStorage.getItem("zledger.fyId");
      if (fyId) {
        api
          .get<{ next_number: string }>(`/vouchers/next-number?voucher_type=receipt&financial_year_id=${fyId}`)
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


  return (
    <div className="space-y-3" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      {/* Top: Horizontal voucher info (Date, Voucher No, Received From, Deposit To, Amount) */}
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          {/* Date */}
          <div className="max-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
            <DateInput value={date} onChange={setDate} data-field="date" />
          </div>
          {/* Voucher No */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Voucher No.</label>
            <div className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9] h-[38px] flex items-center">
              {editingVoucher?.voucher_number || customVoucherNumber || suggestedVoucherNumber || "—"}
            </div>
          </div>
          {/* Received From */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Received From</label>
            <div data-field="received_from">
              <MasterSelector
                entityKey="ledger"
                value={receivedFromId}
                onChange={(id: string) => {
                  setReceivedFromId(id);
                  const ledger = ledgers.find((l) => l.id === id);
                  if (ledger) {
                    setReceivedFromType(ledgerGroupType(ledger));
                  } else {
                    setReceivedFromType(null);
                  }
                }}
                options={receivedFromLedgers.map((l) => ({ value: l.id, label: ledgerOptionLabel(l, partyByLedger) }))}
                placeholder="Select customer / supplier..."
                onItemCreated={() => { onQuickCreate?.("ledger", {}); }}
              />
            </div>
          </div>
          {/* Deposit To */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Deposit To</label>
            <div data-field="deposit_to">
              <MasterSelector
                entityKey="ledger"
                value={depositToId}
                onChange={(id: string) => setDepositToId(id)}
                options={depositToLedgers.map((l) => ({ value: l.id, label: ledgerOptionLabel(l, partyByLedger) }))}
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
        {depositToId && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-[#282832]">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a24]"
              >
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
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
        {/* Party Details (if applicable) */}
        {party && (receivedFromType === "sundry_debtors" || receivedFromType === "sundry_creditors") && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[#282832]">
            <PartyDetailsPanel ledgerId={receivedFromId} parties={parties} partyId={party.id} />
          </div>
        )}
      </div>

      {/* Center: Bill Allocations + Narration */}
      <div className="space-y-3">
        {receivedFromId && party && (receivedFromType === "sundry_debtors" || receivedFromType === "sundry_creditors") && (
          <InvoiceAllocationTable
            partyLedgerId={receivedFromId}
            partyName={party.name}
            receiptAmount={amount}
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
        {/* Action buttons below narration */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="px-6 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-lg shadow-lg transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : editingVoucher?.id ? "Update Receipt" : "Save Receipt"}
          </button>
          <button
            onClick={() => showTemplateModal("receipt", handleSaveAsTemplate)}
            className="px-4 border border-slate-300 dark:border-[#282832] text-slate-700 dark:text-[#cbd5e1] py-2.5 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-[#282832]/40"
          >
            Template
          </button>
        </div>
        {displayError && <div className="text-red-500 text-sm font-medium">{displayError}</div>}
      </div>
    </div>
  );
}
