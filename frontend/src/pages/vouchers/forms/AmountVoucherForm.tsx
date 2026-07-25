import { useEffect, useState, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, AccountGroup } from "../types";
import type { Voucher } from "../types";
import { getVoucherConfig } from "../types";
import VoucherHeader from "../shared/VoucherHeader";
import AmountLineTable from "../shared/AmountLineTable";
import VoucherFooter from "../shared/VoucherFooter";
import type { FlowData } from "../shared/TransactionFlow";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import VoucherTemplateModal, { showTemplateModal } from "../../../components/VoucherTemplateModal";
import type { FinancialYear } from "../shared/fyValidation";
import { validateDateInFy, findFyForDate } from "../shared/fyValidation";

const CASH_BANK = new Set(["GRP_BANK_ACCOUNTS", "GRP_CASH_IN_HAND"]);
const EXPENSE = new Set(["GRP_DIRECT_EXPENSES", "GRP_INDIRECT_EXPENSES"]);
const SUPPLIER = new Set(["GRP_SUNDRY_CREDITORS"]);
const CUSTOMER = new Set(["GRP_SUNDRY_DEBTORS"]);
const INCOME = new Set(["GRP_SALES_ACCOUNTS", "GRP_PURCHASE_ACCOUNTS", "GRP_DIRECT_INCOMES", "GRP_INDIRECT_INCOMES"]);
const ASSET = new Set(["GRP_CURRENT_ASSETS", "GRP_FIXED_ASSETS", "GRP_INVESTMENTS", "GRP_DEPOSITS_ASSETS", "GRP_LOANS_ADVANCES_ASSETS", "GRP_STOCK_IN_HAND", "GRP_SUSPENSE"]);
const LIABILITY = new Set(["GRP_CURRENT_LIABILITIES", "GRP_LOANS_ADVANCES_LIABILITIES", "GRP_PROVISIONS"]);
const TAX = new Set(["GRP_DUTIES_TAXES", "GRP_GST_INPUT", "GRP_GST_OUTPUT", "GRP_REVERSE_CHARGE"]);
const CAPITAL = new Set(["GRP_CAPITAL_ACCOUNT", "GRP_RESERVES_SURPLUS", "GRP_PROFIT_LOSS", "GRP_DRAWINGS", "GRP_OPENING_BALANCE_EQUITY"]);
const PAYMENT_TO = new Set([...EXPENSE, ...SUPPLIER, ...ASSET, ...LIABILITY, ...TAX, ...CAPITAL]);
const RECEIPT_FROM = new Set([...CUSTOMER, ...INCOME, ...ASSET, ...LIABILITY, ...CAPITAL]);

interface AmountVoucherFormProps {
  voucherType: string;
  ledgers: Ledger[];
  parties: Party[];
  accountGroups: AccountGroup[];
  onSubmit: (payload: any) => Promise<void>;
  isSubmitting: boolean;
  error: string;
  setError: (e: string) => void;
  onQuickCreate?: (entityKey: string, item: any) => void;
  createdFrom?: string;
  editingVoucher?: Voucher | null;
  onUpdate?: (id: string, payload: any) => Promise<void>;
  onFlowChange?: (data: FlowData | null) => void;
  formScopeRef?: RefObject<HTMLElement | null>;
  financialYears?: FinancialYear[];
  setActiveFy?: (id: string | null) => void;
  flowSlot?: ReactNode;
  initialData?: {
    party_id?: string;
    narration?: string;
    reference?: string;
    fromLedgerId?: string;
    toLedgerId?: string;
  };
}

const TRANSFER_LABELS: Record<string, { fromLabel: string; toLabel: string; fromHint: string; toHint: string }> = {
  payment: { fromLabel: "From (Bank/Cash)", toLabel: "To (Party/Expense)", fromHint: "the bank or cash account", toHint: "the party or expense ledger" },
  receipt: { fromLabel: "From (Party/Income)", toLabel: "To (Bank/Cash)", fromHint: "the party or income ledger", toHint: "the bank or cash account" },
  contra: { fromLabel: "From (Bank/Cash)", toLabel: "To (Bank/Cash)", fromHint: "source account", toHint: "destination account" },
};

export default function AmountVoucherForm({
  voucherType, ledgers, parties, accountGroups, onSubmit, isSubmitting, error, setError,
  onQuickCreate, createdFrom, editingVoucher, onUpdate, onFlowChange, formScopeRef, financialYears = [], setActiveFy, flowSlot, initialData,
}: AmountVoucherFormProps) {
  const config = getVoucherConfig(voucherType);
  const toast = useToastStore();

  const groupCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of accountGroups) { if (g.system_code) map.set(g.id, g.system_code); }
    return map;
  }, [accountGroups]);

  const { fromLedgers, toLedgers } = useMemo(() => {
    const filterBy = (allowed: Set<string>): Ledger[] => {
      const result = ledgers.filter((l) => { const code = groupCodeMap.get(l.group_id); return code ? allowed.has(code) : false; });
      return result.length > 0 ? result : ledgers;
    };
    switch (voucherType) {
      case "payment": return { fromLedgers: filterBy(CASH_BANK), toLedgers: filterBy(PAYMENT_TO) };
      case "receipt": return { fromLedgers: filterBy(RECEIPT_FROM), toLedgers: filterBy(CASH_BANK) };
      case "contra": return { fromLedgers: filterBy(CASH_BANK), toLedgers: filterBy(CASH_BANK) };
      default: return { fromLedgers: ledgers, toLedgers: ledgers };
    }
  }, [ledgers, voucherType, groupCodeMap]);
  const labels = TRANSFER_LABELS[voucherType] || TRANSFER_LABELS.payment;

  const [date, setDate] = useState(todayIso());
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [partyId, setPartyId] = useState("");
  const [fromLedgerId, setFromLedgerId] = useState("");
  const [toLedgerId, setToLedgerId] = useState("");
  const [amount, setAmount] = useState(0);
  const [suggestedVoucherNumber, setSuggestedVoucherNumber] = useState("");
  const [customVoucherNumber, setCustomVoucherNumber] = useState("");
  const [localError, setLocalError] = useState("");
  const userEditedRef = useRef(false);

  useEffect(() => {
    if (editingVoucher) {
      userEditedRef.current = true;
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      if (editingVoucher.id) { setReference(editingVoucher.reference || ""); }
      else { api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`).then((res) => { if (!userEditedRef.current) setReference(res.next_number); }).catch(() => {}); }
      setPartyId(editingVoucher.party_id || "");
      const debitLine = editingVoucher.lines.find((l) => l.debit > 0);
      const creditLine = editingVoucher.lines.find((l) => l.credit > 0);
      setToLedgerId(debitLine?.ledger_id || "");
      setFromLedgerId(creditLine?.ledger_id || "");
      setAmount(debitLine?.debit || creditLine?.credit || 0);
      setSuggestedVoucherNumber(editingVoucher.voucher_number || "");
      setCustomVoucherNumber("");
    } else {
      userEditedRef.current = false;
      setDate(todayIso()); setNarration(""); setReference(""); setPartyId("");
      setFromLedgerId(""); setToLedgerId(""); setAmount(0); setCustomVoucherNumber("");
      api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`).then((res) => { if (!userEditedRef.current) { setReference(res.next_number); setSuggestedVoucherNumber(res.next_number); } }).catch(() => {});
    }
  }, [editingVoucher, voucherType]);

  // Pre-fill from initialData (Create Similar)
  useEffect(() => {
    if (!initialData || editingVoucher) return;
    if (initialData.party_id) setPartyId(initialData.party_id);
    if (initialData.narration) setNarration(initialData.narration);
    if (initialData.fromLedgerId) setFromLedgerId(initialData.fromLedgerId);
    if (initialData.toLedgerId) setToLedgerId(initialData.toLedgerId);
  }, [initialData]);

  useEffect(() => {
    if (!onFlowChange) return;
    onFlowChange({ voucherType, fromLedgerId: fromLedgerId || undefined, toLedgerId: toLedgerId || undefined, amount });
    return () => { onFlowChange(null); };
  }, [voucherType, fromLedgerId, toLedgerId, amount, onFlowChange]);

  const handleReferenceChange = (v: string) => {
    userEditedRef.current = true;
    setReference(v);
  };

  const resetForm = (force = false) => {
    const hasData = editingVoucher?.id || partyId || fromLedgerId || toLedgerId || amount > 0 || narration;
    if (!force && hasData && !window.confirm("Reset form? Unsaved changes will be lost.")) return;
    userEditedRef.current = false;
    setDate(todayIso()); setNarration(""); setReference(""); setPartyId("");
    setFromLedgerId(""); setToLedgerId(""); setAmount(0); setCustomVoucherNumber(""); setLocalError("");
    api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`).then((res) => { setReference(res.next_number); setSuggestedVoucherNumber(res.next_number); }).catch(() => {});
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    if (setActiveFy && financialYears.length > 0) {
      const fy = findFyForDate(financialYears, newDate);
      if (fy) setActiveFy(fy.id);
    }
  };

  const handlePartyChange = (id: string) => {
    setPartyId(id);
    if (!id) return;
    const party = parties.find((p) => p.id === id);
    if (party?.ledger_id) {
      if (voucherType === "payment") setToLedgerId((prev) => prev || party.ledger_id!);
      else if (voucherType === "receipt") setFromLedgerId((prev) => prev || party.ledger_id!);
    }
  };

  const handleFromLedgerChange = (id: string) => {
    setFromLedgerId(id);
    if (!id || partyId) return;
    const party = parties.find((p) => p.ledger_id === id);
    if (party) setPartyId(party.id);
  };

  const handleToLedgerChange = (id: string) => {
    setToLedgerId(id);
    if (!id || partyId) return;
    const party = parties.find((p) => p.ledger_id === id);
    if (party) setPartyId(party.id);
  };

  const fieldOrder = ["reference", "date", "party", "from_ledger", "amount", "to_ledger", "narration"];

  const handleSave = async () => {
    setError("");
    setLocalError("");
    const fyError = validateDateInFy(financialYears, date);
    if (fyError) { setLocalError(fyError); return; }
    if (!fromLedgerId) { setError(`Please select the "${labels.fromLabel}" ledger`); return; }
    if (!toLedgerId) { setError(`Please select the "${labels.toLabel}" ledger`); return; }
    if (fromLedgerId === toLedgerId) { setError("From and To ledgers cannot be the same"); return; }
    if (amount <= 0) { setError("Amount must be greater than zero"); return; }
    const party = parties.find((p) => p.id === partyId);
    const payload: any = {
      voucher_type: voucherType, voucher_date: date, narration: narration || null, reference: reference || null,
      lines: [{ ledger_id: fromLedgerId, debit: 0, credit: amount }, { ledger_id: toLedgerId, debit: amount, credit: 0 }],
    };
    if (voucherType !== "contra") {
      payload.party_id = partyId || null;
      if (party) { payload.counterparty_gstin = party.gstin || null; payload.counterparty_state_code = party.state_code || null; }
    }
    if (!editingVoucher?.id && customVoucherNumber) payload.voucher_number = customVoucherNumber;
    if (editingVoucher?.id && onUpdate) { await onUpdate(editingVoucher.id, payload); }
    else { try { await onSubmit(payload); resetForm(true); } catch { /* toast already shown */ } }
  };

  useVoucherKeyboard({
    fieldOrder, onSave: handleSave, onReset: resetForm,
    onAltL: () => { document.querySelector<HTMLElement>('[data-field="from_ledger"] input, [data-field="from_ledger"] button')?.focus(); },
    isSubmitting,
    scopeRef: formScopeRef,
  });

  useEffect(() => { focusFirstField(fieldOrder); }, []);

  const handleSaveAsTemplate = async (name: string, frequency: string) => {
    const party = parties.find((p) => p.id === partyId);
    const templatePayload: any = {
      voucher_type: voucherType, voucher_date: date, narration: narration || null, reference: reference || null,
      lines: [{ ledger_id: fromLedgerId, debit: 0, credit: amount }, { ledger_id: toLedgerId, debit: amount, credit: 0 }],
    };
    if (voucherType !== "contra") {
      templatePayload.party_id = partyId || null;
      if (party) { templatePayload.counterparty_gstin = party.gstin || null; templatePayload.counterparty_state_code = party.state_code || null; }
    }
    try {
      await api.post("/recurring-templates", { name, voucher_type: voucherType, frequency, next_run_date: new Date().toISOString().split("T")[0], template_payload: templatePayload });
      toast.success("Template saved!");
    } catch (err: any) { toast.error(err?.message || "Failed to save template"); }
  };

  return (
    <div className="space-y-3">
      <VoucherHeader
        config={config} date={date} onDateChange={handleDateChange} narration={narration} onNarrationChange={setNarration}
        reference={reference} onReferenceChange={handleReferenceChange} partyId={partyId} onPartyChange={handlePartyChange}
        parties={parties} onQuickCreate={onQuickCreate}
        createdFrom={createdFrom} voucherNumber={editingVoucher?.voucher_number}
        suggestedVoucherNumber={!editingVoucher?.id ? suggestedVoucherNumber : undefined}
        onVoucherNumberChange={!editingVoucher?.id ? setCustomVoucherNumber : undefined}
        flowSlot={flowSlot}
      />
      <div>
        <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-blue-500"></span>
          Transfer Details
        </h4>
        <AmountLineTable
          fromLedgerId={fromLedgerId} onFromLedgerChange={handleFromLedgerChange} fromLabel={labels.fromLabel} fromHint={labels.fromHint}
          toLedgerId={toLedgerId} onToLedgerChange={handleToLedgerChange} toLabel={labels.toLabel} toHint={labels.toHint}
          amount={amount} onAmountChange={setAmount} ledgers={ledgers} fromLedgers={fromLedgers} toLedgers={toLedgers}
          onQuickCreate={onQuickCreate} createdFrom={createdFrom}
        />
      </div>
      <VoucherFooter
        subtotal={amount} discountTotal={0} cgstTotal={0} sgstTotal={0} igstTotal={0} grandTotal={amount}
        showItemTotals={false} roundOffTo={null} onRoundOffChange={() => {}} onSave={handleSave}
        isSubmitting={isSubmitting} error={localError || error} isEditing={!!editingVoucher?.id}
        onSaveAsTemplate={() => showTemplateModal(voucherType, handleSaveAsTemplate)}
      />
      <VoucherTemplateModal />
    </div>
  );
}
