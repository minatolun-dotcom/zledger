import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, VoucherLine } from "../types";
import type { Voucher } from "../types";
import { getVoucherConfig, emptyLedgerLine } from "../types";
import VoucherHeader from "../shared/VoucherHeader";
import VoucherFooter from "../shared/VoucherFooter";
import LedgerLineTable from "../shared/LedgerLineTable";
import type { FlowData } from "../shared/TransactionFlow";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import VoucherTemplateModal, { showTemplateModal } from "../../../components/VoucherTemplateModal";
import KeyboardHelp from "../../../components/KeyboardHelp";

interface JournalFormProps {
  ledgers: Ledger[];
  onSubmit: (payload: any) => Promise<void>;
  isSubmitting: boolean;
  error: string;
  setError: (e: string) => void;
  onQuickCreate?: (entityKey: string, item: any) => void;
  createdFrom?: string;
  editingVoucher?: Voucher | null;
  onUpdate?: (id: string, payload: any) => Promise<void>;
  onFlowChange?: (data: FlowData | null) => void;
}

export default function JournalForm({
  ledgers, onSubmit, isSubmitting, error, setError, onQuickCreate, createdFrom, editingVoucher, onUpdate, onFlowChange,
}: JournalFormProps) {
  const config = getVoucherConfig("journal");
  const toast = useToastStore();

  const [date, setDate] = useState(todayIso());
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<VoucherLine[]>([emptyLedgerLine(), emptyLedgerLine()]);

  useEffect(() => {
    if (editingVoucher) {
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      setLines(editingVoucher.lines.length > 0 ? editingVoucher.lines.map((l) => ({
        ledger_id: l.ledger_id, stock_item_id: null, quantity: null, rate: null, discount_pct: 0,
        discount_amount: 0, debit: l.debit, credit: l.credit, line_total: null, gst_rate: null, is_rate_inclusive: false,
      })) : [emptyLedgerLine(), emptyLedgerLine()]);
    } else {
      setDate(todayIso()); setNarration(""); setLines([emptyLedgerLine(), emptyLedgerLine()]);
    }
  }, [editingVoucher]);

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  const isBalanced = Math.abs(diff) < 0.01 && totalDebit > 0;

  useEffect(() => {
    if (!onFlowChange) return;
    onFlowChange({
      voucherType: "journal", amount: totalDebit,
      debitLines: lines.filter((l) => l.debit > 0 && l.ledger_id).map((l) => ({ ledger_id: l.ledger_id, amount: l.debit })),
      creditLines: lines.filter((l) => l.credit > 0 && l.ledger_id).map((l) => ({ ledger_id: l.ledger_id, amount: l.credit })),
    });
    return () => { onFlowChange(null); };
  }, [lines, totalDebit, onFlowChange]);

  const handleAutoBalance = () => {
    if (totalDebit === totalCredit) return;
    const updated = [...lines];
    const lastIdx = updated.length - 1;
    if (!updated[lastIdx].ledger_id) {
      if (diff > 0) updated[lastIdx] = { ...updated[lastIdx], credit: Math.abs(diff) };
      else updated[lastIdx] = { ...updated[lastIdx], debit: Math.abs(diff) };
    } else {
      updated.push({ ...emptyLedgerLine(), ...(diff > 0 ? { credit: Math.abs(diff) } : { debit: Math.abs(diff) }) });
    }
    setLines(updated);
  };

  const resetForm = () => {
    setDate(todayIso()); setNarration(""); setLines([emptyLedgerLine(), emptyLedgerLine()]);
  };

  const fieldOrder = ["date", "narration"];
  lines.forEach((_, i) => { fieldOrder.push(`ledger_${i}`); fieldOrder.push(`debit_${i}`); fieldOrder.push(`credit_${i}`); });

  const handleSave = async () => {
    setError("");
    if (!isBalanced) { setError(`Debits and credits must be equal (difference: ₹${Math.abs(diff).toLocaleString("en-IN")})`); return; }
    if (totalDebit === 0) { setError("Total must be greater than zero"); return; }
    const payload: any = {
      voucher_type: "journal", voucher_date: date, narration: narration || null, reference: null,
      lines: lines.filter((l) => l.ledger_id).map((l) => ({ ledger_id: l.ledger_id, debit: l.debit, credit: l.credit })),
    };
    if (editingVoucher?.id && onUpdate) { await onUpdate(editingVoucher.id, payload); }
    else { await onSubmit(payload); resetForm(); }
  };

  useVoucherKeyboard({
    fieldOrder, onSave: handleSave, onReset: resetForm,
    onAddLine: () => setLines([...lines, emptyLedgerLine()]),
    isSubmitting,
  });

  useEffect(() => { focusFirstField(fieldOrder); }, []);

  const handleSaveAsTemplate = async (name: string, frequency: string) => {
    const templatePayload = {
      voucher_type: "journal", voucher_date: date, narration: narration || null, reference: null,
      lines: lines.filter((l) => l.ledger_id).map((l) => ({ ledger_id: l.ledger_id, debit: l.debit, credit: l.credit })),
    };
    try {
      await api.post("/recurring-templates", { name, voucher_type: "journal", frequency, next_run_date: new Date().toISOString().split("T")[0], template_payload: templatePayload });
      toast.success("Template saved!");
    } catch (err: any) { toast.error(err?.message || "Failed to save template"); }
  };

  return (
    <div className="space-y-3">
      <KeyboardHelp active={true} />
      <VoucherHeader
        config={config} date={date} onDateChange={setDate} narration={narration} onNarrationChange={setNarration}
        reference="" onReferenceChange={() => {}} partyId="" onPartyChange={() => {}}
        documentType="regular" onDocumentTypeChange={() => {}} parties={[]}
        voucherNumber={editingVoucher?.voucher_number} createdFrom={createdFrom}
      />
      <div>
        <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          Ledgers
        </h4>
        <LedgerLineTable lines={lines} onLinesChange={setLines} ledgers={ledgers} onQuickCreate={onQuickCreate} createdFrom={createdFrom} />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleAutoBalance} disabled={isBalanced || totalDebit === 0}
          className="rounded-lg border border-brand-300 dark:border-blue-500/20 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-blue-400 hover:bg-brand-50 dark:hover:bg-blue-500/10 disabled:opacity-50 transition-all">
          Auto Balance
        </button>
        {!isBalanced && totalDebit > 0 && <span className="text-xs font-medium text-red-600">Difference: ₹{Math.abs(diff).toLocaleString("en-IN")}</span>}
        {isBalanced && <span className="text-xs font-semibold text-emerald-600">Balanced</span>}
      </div>
      <VoucherFooter
        subtotal={totalDebit} discountTotal={0} cgstTotal={0} sgstTotal={0} igstTotal={0} grandTotal={totalDebit}
        showItemTotals={false} roundOffTo={null} onRoundOffChange={() => {}} onSave={handleSave}
        isSubmitting={isSubmitting} error={error} isEditing={!!editingVoucher?.id}
        onSaveAsTemplate={() => showTemplateModal("journal", handleSaveAsTemplate)}
      />
      <VoucherTemplateModal />
    </div>
  );
}
