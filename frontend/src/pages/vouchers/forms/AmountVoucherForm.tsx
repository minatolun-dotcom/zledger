import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party } from "../types";
import type { Voucher } from "../types";
import { getVoucherConfig } from "../types";
import VoucherHeader from "../shared/VoucherHeader";
import AmountLineTable from "../shared/AmountLineTable";
import VoucherFooter from "../shared/VoucherFooter";

interface AmountVoucherFormProps {
  voucherType: string;
  ledgers: Ledger[];
  parties: Party[];
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
  onSubmit,
  isSubmitting,
  error,
  setError,
  onQuickCreate,
  editingVoucher,
  onUpdate,
}: AmountVoucherFormProps) {
  const config = getVoucherConfig(voucherType);
  const labels = TRANSFER_LABELS[voucherType] || TRANSFER_LABELS.payment;

  const [date, setDate] = useState(todayIso());
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [partyId, setPartyId] = useState("");
  const [fromLedgerId, setFromLedgerId] = useState("");
  const [toLedgerId, setToLedgerId] = useState("");
  const [amount, setAmount] = useState(0);

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
    } else {
      setDate(todayIso());
      setNarration("");
      setReference("");
      setPartyId("");
      setFromLedgerId("");
      setToLedgerId("");
      setAmount(0);
      api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`)
        .then((res) => setReference(res.next_number))
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
    api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`)
      .then((res) => setReference(res.next_number))
      .catch(() => {});
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
      alert("Template saved!");
    } catch (err: any) {
      alert(err?.detail || "Failed to save template");
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
        onPartyChange={setPartyId}
        documentType="regular"
        onDocumentTypeChange={() => {}}
        parties={parties}
        onQuickCreate={onQuickCreate}
      />

      <AmountLineTable
        fromLedgerId={fromLedgerId}
        onFromLedgerChange={setFromLedgerId}
        fromLabel={labels.fromLabel}
        fromHint={labels.fromHint}
        toLedgerId={toLedgerId}
        onToLedgerChange={setToLedgerId}
        toLabel={labels.toLabel}
        toHint={labels.toHint}
        amount={amount}
        onAmountChange={setAmount}
        ledgers={ledgers}
        onQuickCreate={onQuickCreate}
      />

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
