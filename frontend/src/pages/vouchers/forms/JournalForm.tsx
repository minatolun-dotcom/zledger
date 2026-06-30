import { useEffect, useState } from "react";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, VoucherLine } from "../types";
import type { Voucher } from "../types";
import { getVoucherConfig, emptyLedgerLine } from "../types";
import VoucherHeader from "../shared/VoucherHeader";
import VoucherFooter from "../shared/VoucherFooter";
import LedgerLineTable from "../shared/LedgerLineTable";

interface JournalFormProps {
  ledgers: Ledger[];
  onSubmit: (payload: any) => Promise<void>;
  isSubmitting: boolean;
  error: string;
  setError: (e: string) => void;
  onQuickCreate?: (entityKey: string, item: any) => void;
  editingVoucher?: Voucher | null;
  onUpdate?: (id: string, payload: any) => Promise<void>;
}

export default function JournalForm({
  ledgers,
  onSubmit,
  isSubmitting,
  error,
  setError,
  onQuickCreate,
  editingVoucher,
  onUpdate,
}: JournalFormProps) {
  const config = getVoucherConfig("journal");

  const [date, setDate] = useState(todayIso());
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<VoucherLine[]>([
    emptyLedgerLine(),
    emptyLedgerLine(),
  ]);

  useEffect(() => {
    if (editingVoucher) {
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      setLines(
        editingVoucher.lines.length > 0
          ? editingVoucher.lines.map((l) => ({
              ledger_id: l.ledger_id,
              stock_item_id: null,
              quantity: null,
              rate: null,
              discount_pct: 0,
              discount_amount: 0,
              debit: l.debit,
              credit: l.credit,
              line_total: null,
              gst_rate: null,
              is_rate_inclusive: false,
            }))
          : [emptyLedgerLine(), emptyLedgerLine()]
      );
    } else {
      setDate(todayIso());
      setNarration("");
      setLines([emptyLedgerLine(), emptyLedgerLine()]);
    }
  }, [editingVoucher]);

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  const isBalanced = Math.abs(diff) < 0.01 && totalDebit > 0;

  const handleAutoBalance = () => {
    if (totalDebit === totalCredit) return;
    const updated = [...lines];
    const lastIdx = updated.length - 1;
    if (!updated[lastIdx].ledger_id) {
      if (diff > 0) {
        updated[lastIdx] = { ...updated[lastIdx], credit: Math.abs(diff) };
      } else {
        updated[lastIdx] = { ...updated[lastIdx], debit: Math.abs(diff) };
      }
    } else {
      updated.push({
        ...emptyLedgerLine(),
        ...(diff > 0 ? { credit: Math.abs(diff) } : { debit: Math.abs(diff) }),
      });
    }
    setLines(updated);
  };

  const resetForm = () => {
    setDate(todayIso());
    setNarration("");
    setLines([emptyLedgerLine(), emptyLedgerLine()]);
  };

  const handleSubmit = async () => {
    setError("");
    if (!isBalanced) {
      setError(`Debits and credits must be equal (difference: ₹${Math.abs(diff).toLocaleString("en-IN")})`);
      return;
    }
    if (totalDebit === 0) {
      setError("Total must be greater than zero");
      return;
    }

    const payload: any = {
      voucher_type: "journal",
      voucher_date: date,
      narration: narration || null,
      reference: null,
      lines: lines
        .filter((l) => l.ledger_id)
        .map((l) => ({
          ledger_id: l.ledger_id,
          debit: l.debit,
          credit: l.credit,
        })),
    };
    if (editingVoucher?.id && onUpdate) {
      await onUpdate(editingVoucher.id, payload);
    } else {
      await onSubmit(payload);
      resetForm();
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
        reference=""
        onReferenceChange={() => {}}
        partyId=""
        onPartyChange={() => {}}
        documentType="regular"
        onDocumentTypeChange={() => {}}
        parties={[]}
      />

      <LedgerLineTable
        lines={lines}
        onLinesChange={setLines}
        ledgers={ledgers}
        onQuickCreate={onQuickCreate}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAutoBalance}
          disabled={isBalanced || totalDebit === 0}
          className="rounded border border-brand-300 px-2.5 py-1 text-[11px] font-medium text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50"
        >
          Auto Balance
        </button>
        {!isBalanced && totalDebit > 0 && (
          <span className="text-[11px] text-red-600">
            Difference: ₹{Math.abs(diff).toLocaleString("en-IN")}
          </span>
        )}
        {isBalanced && (
          <span className="text-[11px] text-emerald-600 font-medium">Balanced</span>
        )}
      </div>

      <VoucherFooter
        subtotal={totalDebit}
        discountTotal={0}
        cgstTotal={0}
        sgstTotal={0}
        igstTotal={0}
        grandTotal={totalDebit}
        showItemTotals={false}
        voucherType="journal"
        roundOffTo={null}
        onRoundOffChange={() => {}}
        onSave={handleSubmit}
        isSubmitting={isSubmitting}
        error={error}
        sticky
        isEditing={!!editingVoucher?.id}
      />
    </div>
  );
}
