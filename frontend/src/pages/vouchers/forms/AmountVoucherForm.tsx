import { useEffect, useState, useMemo } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, AccountGroup } from "../types";
import type { Voucher } from "../types";
import { getVoucherConfig } from "../types";
import VoucherHeader from "../shared/VoucherHeader";
import AmountLineTable from "../shared/AmountLineTable";
import TransactionFlow from "../shared/TransactionFlow";
import VoucherFooter from "../shared/VoucherFooter";

// ── Allowed group system_codes per voucher type per side ──────────────
// UI filter only — backend still validates double-entry rules.

const CASH_BANK = new Set(["GRP_BANK_ACCOUNTS", "GRP_CASH_IN_HAND"]);

const EXPENSE = new Set(["GRP_DIRECT_EXPENSES", "GRP_INDIRECT_EXPENSES"]);
const SUPPLIER = new Set(["GRP_SUNDRY_CREDITORS"]);
const CUSTOMER = new Set(["GRP_SUNDRY_DEBTORS"]);
const INCOME = new Set(["GRP_SALES_ACCOUNTS", "GRP_PURCHASE_ACCOUNTS", "GRP_DIRECT_INCOMES", "GRP_INDIRECT_INCOMES"]);
const ASSET = new Set([
  "GRP_CURRENT_ASSETS", "GRP_FIXED_ASSETS", "GRP_INVESTMENTS",
  "GRP_DEPOSITS_ASSETS", "GRP_LOANS_ADVANCES_ASSETS", "GRP_STOCK_IN_HAND", "GRP_SUSPENSE",
]);
const LIABILITY = new Set(["GRP_CURRENT_LIABILITIES", "GRP_LOANS_ADVANCES_LIABILITIES", "GRP_PROVISIONS"]);
const TAX = new Set(["GRP_DUTIES_TAXES", "GRP_GST_INPUT", "GRP_GST_OUTPUT", "GRP_REVERSE_CHARGE"]);
const CAPITAL = new Set(["GRP_CAPITAL_ACCOUNT", "GRP_RESERVES_SURPLUS", "GRP_PROFIT_LOSS", "GRP_DRAWINGS", "GRP_OPENING_BALANCE_EQUITY"]);

// Merge sets for combined rules
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
  editingVoucher?: Voucher | null;
  onUpdate?: (id: string, payload: any) => Promise<void>;
}

const TRANSFER_LABELS: Record<string, { fromLabel: string; toLabel: string; fromHint: string; toHint: string }> = {
  payment: {
    fromLabel: "From (Bank/Cash)",
    toLabel: "To (Party/Expense)",
    fromHint: "Select the bank or cash account",
    toHint: "Select the party or expense ledger",
  },
  receipt: {
    fromLabel: "From (Party/Income)",
    toLabel: "To (Bank/Cash)",
    fromHint: "Select the party or income ledger",
    toHint: "Select the bank or cash account",
  },
  contra: {
    fromLabel: "From (Bank/Cash)",
    toLabel: "To (Bank/Cash)",
    fromHint: "Select source account",
    toHint: "Select destination account",
  },
};

export default function AmountVoucherForm({
  voucherType,
  ledgers,
  parties,
  accountGroups,
  onSubmit,
  isSubmitting,
  error,
  setError,
  onQuickCreate,
  editingVoucher,
  onUpdate,
}: AmountVoucherFormProps) {
  const config = getVoucherConfig(voucherType);
  const toast = useToastStore();

  // Build group_id → system_code lookup
  const groupCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of accountGroups) {
      if (g.system_code) map.set(g.id, g.system_code);
    }
    return map;
  }, [accountGroups]);

  // Strict filtering: only show allowed ledgers per voucher type per side
  const { fromLedgers, toLedgers } = useMemo(() => {
    const filterBy = (allowed: Set<string>): Ledger[] => {
      const result = ledgers.filter((l) => {
        const code = groupCodeMap.get(l.group_id);
        return code ? allowed.has(code) : false;
      });
      // Fallback: if no ledgers match (e.g. new company), show all
      return result.length > 0 ? result : ledgers;
    };

    switch (voucherType) {
      case "payment":
        return { fromLedgers: filterBy(CASH_BANK), toLedgers: filterBy(PAYMENT_TO) };
      case "receipt":
        return { fromLedgers: filterBy(RECEIPT_FROM), toLedgers: filterBy(CASH_BANK) };
      case "contra":
        return { fromLedgers: filterBy(CASH_BANK), toLedgers: filterBy(CASH_BANK) };
      default:
        return { fromLedgers: ledgers, toLedgers: ledgers };
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

  useEffect(() => {
    if (editingVoucher) {
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      if (editingVoucher.id) {
        setReference(editingVoucher.reference || "");
      } else {
        api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`)
          .then((res) => setReference(res.next_number))
          .catch(() => {});
      }
      setPartyId(editingVoucher.party_id || "");
      const debitLine = editingVoucher.lines.find((l) => l.debit > 0);
      const creditLine = editingVoucher.lines.find((l) => l.credit > 0);
      setToLedgerId(debitLine?.ledger_id || "");
      setFromLedgerId(creditLine?.ledger_id || "");
      setAmount(debitLine?.debit || creditLine?.credit || 0);
      setSuggestedVoucherNumber(editingVoucher.voucher_number || "");
      setCustomVoucherNumber("");
    } else {
      setDate(todayIso());
      setNarration("");
      setReference("");
      setPartyId("");
      setFromLedgerId("");
      setToLedgerId("");
      setAmount(0);
      setCustomVoucherNumber("");
      api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`)
        .then((res) => {
          setReference(res.next_number);
          setSuggestedVoucherNumber(res.next_number);
        })
        .catch(() => {});
    }
  }, [editingVoucher, voucherType]);

  const resetForm = () => {
    setDate(todayIso());
    setNarration("");
    setReference("");
    setPartyId("");
    setFromLedgerId("");
    setToLedgerId("");
    setAmount(0);
    setCustomVoucherNumber("");
    api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`)
      .then((res) => {
        setReference(res.next_number);
        setSuggestedVoucherNumber(res.next_number);
      })
      .catch(() => {});
  };

  // Auto-detect: Party → Ledger
  const handlePartyChange = (id: string) => {
    setPartyId(id);
    if (!id) return;
    const party = parties.find((p) => p.id === id);
    if (party?.ledger_id) {
      if (voucherType === "payment") {
        setToLedgerId((prev) => prev || party.ledger_id!);
      } else if (voucherType === "receipt") {
        setFromLedgerId((prev) => prev || party.ledger_id!);
      }
    }
  };

  // Auto-detect: Ledger → Party
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

  const handleSubmit = async () => {
    setError("");
    if (!fromLedgerId) {
      setError(`Please select the "${labels.fromLabel}" ledger`);
      return;
    }
    if (!toLedgerId) {
      setError(`Please select the "${labels.toLabel}" ledger`);
      return;
    }
    if (fromLedgerId === toLedgerId) {
      setError("From and To ledgers cannot be the same");
      return;
    }
    if (amount <= 0) {
      setError("Amount must be greater than zero");
      return;
    }

    const party = parties.find((p) => p.id === partyId);

    const payload: any = {
      voucher_type: voucherType,
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      lines: [
        { ledger_id: fromLedgerId, debit: 0, credit: amount },
        { ledger_id: toLedgerId, debit: amount, credit: 0 },
      ],
    };

    if (voucherType !== "contra") {
      payload.party_id = partyId || null;
      if (party) {
        payload.counterparty_gstin = party.gstin || null;
        payload.counterparty_state_code = party.state_code || null;
      }
    }

    if (!editingVoucher?.id && customVoucherNumber) {
      payload.voucher_number = customVoucherNumber;
    }

    if (editingVoucher?.id && onUpdate) {
      await onUpdate(editingVoucher.id, payload);
    } else {
      await onSubmit(payload);
      resetForm();
    }
  };

  const handleSaveAsTemplate = async () => {
    const name = prompt("Template name:");
    if (!name) return;
    const frequency = prompt("Frequency (daily/weekly/monthly/yearly):", "monthly");
    if (!frequency || !["daily", "weekly", "monthly", "yearly"].includes(frequency)) return;

    const party = parties.find((p) => p.id === partyId);
    const templatePayload: any = {
      voucher_type: voucherType,
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      lines: [
        { ledger_id: fromLedgerId, debit: 0, credit: amount },
        { ledger_id: toLedgerId, debit: amount, credit: 0 },
      ],
    };
    if (voucherType !== "contra") {
      templatePayload.party_id = partyId || null;
      if (party) {
        templatePayload.counterparty_gstin = party.gstin || null;
        templatePayload.counterparty_state_code = party.state_code || null;
      }
    }

    try {
      await api.post("/recurring-templates", {
        name,
        voucher_type: voucherType,
        frequency,
        next_run_date: new Date().toISOString().split("T")[0],
        template_payload: templatePayload,
      });
      toast.success("Template saved!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save template");
    }
  };

  return (
    <div className="space-y-3">
      <VoucherHeader
        config={config}
        date={date}
        onDateChange={setDate}
        narration={narration}
        onNarrationChange={setNarration}
        reference={reference}
        onReferenceChange={setReference}
        partyId={partyId}
        onPartyChange={handlePartyChange}
        documentType="regular"
        onDocumentTypeChange={() => {}}
        parties={parties}
        onQuickCreate={onQuickCreate}
        voucherNumber={editingVoucher?.voucher_number}
        suggestedVoucherNumber={!editingVoucher?.id ? suggestedVoucherNumber : undefined}
        onVoucherNumberChange={!editingVoucher?.id ? setCustomVoucherNumber : undefined}
      />

      <TransactionFlow
        voucherType={voucherType}
        fromLabel={labels.fromLabel}
        toLabel={labels.toLabel}
        fromLedgerId={fromLedgerId}
        toLedgerId={toLedgerId}
        amount={amount}
        ledgers={ledgers}
      />

      <div>
        <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-blue-500"></span>
          Transfer Details
        </h4>
        <AmountLineTable
          fromLedgerId={fromLedgerId}
          onFromLedgerChange={handleFromLedgerChange}
          fromLabel={labels.fromLabel}
          fromHint={labels.fromHint}
          toLedgerId={toLedgerId}
          onToLedgerChange={handleToLedgerChange}
          toLabel={labels.toLabel}
          toHint={labels.toHint}
          amount={amount}
          onAmountChange={setAmount}
          ledgers={ledgers}
          fromLedgers={fromLedgers}
          toLedgers={toLedgers}
          onQuickCreate={onQuickCreate}
        />
      </div>

      <VoucherFooter
        subtotal={amount}
        discountTotal={0}
        cgstTotal={0}
        sgstTotal={0}
        igstTotal={0}
        grandTotal={amount}
        showItemTotals={false}
        voucherType={voucherType}
        roundOffTo={null}
        onRoundOffChange={() => {}}
        onSave={handleSubmit}
        isSubmitting={isSubmitting}
        error={error}
        sticky
        isEditing={!!editingVoucher?.id}
        onSaveAsTemplate={handleSaveAsTemplate}
      />
    </div>
  );
}
