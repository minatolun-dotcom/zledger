import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, StockItem, VoucherLine } from "../types";
import { getVoucherConfig, emptyItemLine } from "../types";
import VoucherHeader from "../shared/VoucherHeader";
import ItemLineTable from "../shared/ItemLineTable";
import VoucherFooter from "../shared/VoucherFooter";
import type { FlowData } from "../shared/TransactionFlow";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import VoucherTemplateModal, { showTemplateModal } from "../../../components/VoucherTemplateModal";
import type { FinancialYear } from "../shared/fyValidation";
import { validateDateInFy, findFyForDate } from "../shared/fyValidation";

interface ItemVoucherFormProps {
  voucherType: string;
  ledgers: Ledger[];
  parties: Party[];
  stockItems: StockItem[];
  onSubmit: (payload: any) => Promise<void>;
  isSubmitting: boolean;
  error: string;
  setError: (e: string) => void;
  onQuickCreate?: (entityKey: string, item: any) => void;
  createdFrom?: string;
  editingVoucher?: import("../types").Voucher | null;
  onUpdate?: (id: string, payload: any) => Promise<void>;
  onFlowChange?: (data: FlowData | null) => void;
  formScopeRef?: RefObject<HTMLElement | null>;
  financialYears?: FinancialYear[];
  setActiveFy?: (id: string | null) => void;
  flowSlot?: ReactNode;
  /** Pre-fill values for "Create Similar" — same as editing but no id, amounts cleared */
  initialData?: {
    party_id?: string;
    narration?: string;
    reference?: string;
    counterparty_gstin?: string | null;
    counterparty_state_code?: string | null;
    place_of_supply?: string | null;
    counterLedgerId?: string;
    lines?: Partial<VoucherLine>[];
  };
}

const AUTO_LEDGER_GROUP: Record<string, string> = {
  sales: "Sales", purchase: "Purchase", credit_note: "Sales", debit_note: "Purchase",
};

export default function ItemVoucherForm({
  voucherType, ledgers, parties, stockItems, onSubmit, isSubmitting, error, setError,
  onQuickCreate, createdFrom, editingVoucher, onUpdate, onFlowChange, formScopeRef,
  financialYears = [], setActiveFy, flowSlot, initialData,
}: ItemVoucherFormProps) {
  const config = getVoucherConfig(voucherType);
  const toast = useToastStore();

  const [date, setDate] = useState(todayIso());
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [partyId, setPartyId] = useState("");
  const [localError, setLocalError] = useState("");
  const [lines, setLines] = useState<VoucherLine[]>([emptyItemLine()]);
  const [counterLedgerId, setCounterLedgerId] = useState("");
  const [roundOffTo, setRoundOffTo] = useState<number | null>(null);
  const [suggestedVoucherNumber, setSuggestedVoucherNumber] = useState("");
  const [customVoucherNumber, setCustomVoucherNumber] = useState("");

  useEffect(() => {
    if (editingVoucher) {
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      if (editingVoucher.id) { setReference(editingVoucher.reference || ""); }
      else { api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`).then((res) => setReference(res.next_number)).catch(() => {}); }
      setPartyId(editingVoucher.party_id || "");
      const r = editingVoucher.round_off_to;
      setRoundOffTo(r === 1 || r === 0.5 ? 0 : r);
      const itemLines = (editingVoucher.lines || []).filter((l) => l.stock_item_id).map((l) => {
        let derivedGstRate = null;
        if (l.line_total && l.line_total > 0) {
          const totalGst = (l.cgst_amount || 0) + (l.sgst_amount || 0) + (l.igst_amount || 0);
          if (totalGst > 0) derivedGstRate = Math.round((totalGst / l.line_total) * 100 * 100) / 100;
        }
        return { ledger_id: l.ledger_id, stock_item_id: l.stock_item_id, quantity: l.quantity, rate: l.rate,
          discount_pct: l.discount_pct, discount_amount: l.discount_amount, debit: l.debit, credit: l.credit,
          line_total: l.line_total, gst_rate: derivedGstRate, is_rate_inclusive: l.is_rate_inclusive };
      });
      setLines(itemLines.length > 0 ? itemLines : [emptyItemLine()]);
      const counterLine = editingVoucher.lines.find((l) => !l.stock_item_id && !l.hsn_sac_id && (l.debit > 0 || l.credit > 0));
      setCounterLedgerId(counterLine?.ledger_id || "");
      setSuggestedVoucherNumber(editingVoucher.voucher_number || "");
      setCustomVoucherNumber("");
    } else {
      setDate(todayIso()); setNarration(""); setReference(""); setPartyId("");
      setLines([emptyItemLine()]); setCounterLedgerId("");
      setRoundOffTo(null); setCustomVoucherNumber("");
      api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`).then((res) => { setReference(res.next_number); setSuggestedVoucherNumber(res.next_number); }).catch(() => {});
    }
  }, [editingVoucher, voucherType]);

  // Pre-fill from initialData (Create Similar)
  useEffect(() => {
    if (!initialData || editingVoucher) return;
    if (initialData.party_id) setPartyId(initialData.party_id);
    if (initialData.narration) setNarration(initialData.narration);
    if (initialData.counterLedgerId) setCounterLedgerId(initialData.counterLedgerId);
    if (initialData.lines && initialData.lines.length > 0) {
      const filled = initialData.lines.map((l) => ({
        ...emptyItemLine(),
        ...l,
        quantity: null,
        rate: null,
        discount_pct: 0,
        discount_amount: 0,
        debit: 0,
        credit: 0,
        line_total: null,
        gst_rate: l.gst_rate ?? null,
      }));
      setLines(filled);
    }
  }, [initialData]);

  const counterLedgers = ledgers.filter((l) => l.name === "Cash" || (l.name && l.name.toLowerCase().includes("bank")));

  const handlePartyChange = (id: string) => {
    setPartyId(id);
    if (!id) return;
    const party = parties.find((p) => p.id === id);
    if (party?.ledger_id && !counterLedgerId) setCounterLedgerId(party.ledger_id);
  };

  const handleCounterLedgerChange = (id: string) => {
    setCounterLedgerId(id);
    if (!id || partyId) return;
    const party = parties.find((p) => p.ledger_id === id);
    if (party) setPartyId(party.id);
  };

  const linesCalc = lines.map((line) => {
    if (line.stock_item_id && line.quantity && line.rate) {
      const item = stockItems.find((s) => s.id === line.stock_item_id);
      const gross = line.quantity * line.rate;
      const discountAmt = line.discount_pct > 0 ? (gross * line.discount_pct) / 100 : line.discount_amount;
      const inclusiveTotal = gross - discountAmt;
      const gstRate = line.gst_rate ?? item?.gst_rate ?? 0;
      let lineTotal: number; let cgst: number; let sgst: number;
      if (line.is_rate_inclusive && gstRate > 0) {
        lineTotal = Number((inclusiveTotal / (1 + gstRate / 100)).toFixed(2));
        cgst = Number((lineTotal * (gstRate / 2) / 100).toFixed(2));
        sgst = Number((lineTotal * (gstRate / 2) / 100).toFixed(2));
      } else {
        lineTotal = inclusiveTotal;
        cgst = gstRate > 0 ? (lineTotal * (gstRate / 2)) / 100 : 0;
        sgst = gstRate > 0 ? (lineTotal * (gstRate / 2)) / 100 : 0;
      }
      return { ...line, discount_amount: discountAmt, line_total: lineTotal, cgst, sgst };
    }
    return { ...line, line_total: null, cgst: 0, sgst: 0 };
  });

  const totals = linesCalc.reduce((acc, l) => {
    if (l.line_total !== null) { acc.subtotal += l.line_total; acc.discountTotal += l.discount_amount; acc.taxTotal += (l.cgst ?? 0) + (l.sgst ?? 0); }
    return acc;
  }, { subtotal: 0, discountTotal: 0, taxTotal: 0 });

  const rawGrandTotal = totals.subtotal + totals.taxTotal;
  let grandTotal: number;
  if (roundOffTo === null) grandTotal = Number(rawGrandTotal.toFixed(2));
  else if (roundOffTo === 0) grandTotal = Math.round(rawGrandTotal);
  else if (roundOffTo === 1) grandTotal = Math.ceil(rawGrandTotal);
  else grandTotal = Math.floor(rawGrandTotal);

  useEffect(() => {
    if (!onFlowChange) return;
    const party = parties.find((p) => p.id === partyId);
    onFlowChange({ voucherType, partyName: party?.name, fromLedgerId: counterLedgerId || undefined, amount: grandTotal });
    return () => { onFlowChange(null); };
  }, [voucherType, partyId, counterLedgerId, grandTotal, parties, onFlowChange]);

  const isPurchaseLike = voucherType === "purchase" || voucherType === "debit_note";
  const isCreditLike = voucherType === "credit_note" || voucherType === "debit_note";

  const resetForm = (force = false) => {
    const hasData = editingVoucher?.id || lines.some((l) => l.stock_item_id || l.ledger_id) || partyId || narration;
    if (!force && hasData && !window.confirm("Reset form? Unsaved changes will be lost.")) return;
    setDate(todayIso()); setNarration(""); setReference(""); setPartyId("");
    setLines([emptyItemLine()]); setCounterLedgerId("");
    setRoundOffTo(null); setCustomVoucherNumber("");
    api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`).then((res) => { setReference(res.next_number); setSuggestedVoucherNumber(res.next_number); }).catch(() => {});
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    if (setActiveFy && financialYears.length > 0) {
      const fy = findFyForDate(financialYears, newDate);
      if (fy) setActiveFy(fy.id);
    }
  };

  const fieldOrder = ["reference", "date", "party", "counter_ledger", "narration"];
  lines.forEach((_, i) => { fieldOrder.push(`item_${i}`); fieldOrder.push(`qty_${i}`); fieldOrder.push(`rate_${i}`); fieldOrder.push(`inclusive_${i}`); fieldOrder.push(`disc_${i}`); });

  const handleSave = async () => {
    setError("");
    setLocalError("");
    const fyError = validateDateInFy(financialYears, date);
    if (fyError) { setLocalError(fyError); return; }
    const party = parties.find((p) => p.id === partyId);
    if (partyId && !party?.state_code) { setError("Selected party does not have a registered state. Please update the Party master to add the state before posting."); return; }
    if (!counterLedgerId && grandTotal > 0) { setError(`Please select the ${isPurchaseLike ? "credit" : "debit"} account`); return; }
    const itemLines = linesCalc.filter((l) => l.ledger_id || l.stock_item_id).map((l) => ({
      ledger_id: l.ledger_id, stock_item_id: l.stock_item_id, quantity: l.quantity, rate: l.rate,
      discount_pct: l.discount_pct, discount_amount: l.discount_amount, gst_rate: l.gst_rate, is_rate_inclusive: l.is_rate_inclusive,
    }));
    const counterLines = counterLedgerId ? [{
      ledger_id: counterLedgerId, stock_item_id: null, quantity: null, rate: null, discount_pct: 0,
      discount_amount: 0, gst_rate: null, is_rate_inclusive: false,
      debit: isPurchaseLike || isCreditLike ? 0 : grandTotal, credit: isPurchaseLike || isCreditLike ? grandTotal : 0,
    }] : [];
    const payload: any = {
      voucher_type: voucherType, voucher_date: date, narration: narration || null, reference: reference || null,
      party_id: partyId || null, place_of_supply: party?.state_code || null, document_type: "regular",
      counterparty_gstin: party?.gstin || null, counterparty_state_code: party?.state_code || null,
      round_off_to: roundOffTo, lines: [...itemLines, ...counterLines],
    };
    if (!editingVoucher?.id && customVoucherNumber) payload.voucher_number = customVoucherNumber;
    if (editingVoucher?.id && onUpdate) { await onUpdate(editingVoucher.id, payload); }
    else { try { await onSubmit(payload); resetForm(true); } catch { /* toast already shown */ } }
  };

  useVoucherKeyboard({
    fieldOrder, onSave: handleSave, onReset: resetForm,
    onAltL: () => {
      const partyEl = document.querySelector<HTMLElement>('[data-field="party"] input, [data-field="party"] button');
      const counterEl = document.querySelector<HTMLElement>('[data-field="counter_ledger"] input, [data-field="counter_ledger"] button');
      (counterEl || partyEl)?.focus();
    },
    isSubmitting,
    scopeRef: formScopeRef,
  });

  useEffect(() => { focusFirstField(fieldOrder); }, []);

  const handleSaveAsTemplate = async (name: string, frequency: string) => {
    const party = parties.find((p) => p.id === partyId);
    const itemLines = linesCalc.filter((l) => l.ledger_id || l.stock_item_id).map((l) => ({
      ledger_id: l.ledger_id, stock_item_id: l.stock_item_id, quantity: l.quantity, rate: l.rate,
      discount_pct: l.discount_pct, discount_amount: l.discount_amount, gst_rate: l.gst_rate, is_rate_inclusive: l.is_rate_inclusive,
    }));
    const counterLines = counterLedgerId ? [{
      ledger_id: counterLedgerId, stock_item_id: null, quantity: null, rate: null, discount_pct: 0,
      discount_amount: 0, gst_rate: null, is_rate_inclusive: false,
      debit: isPurchaseLike || isCreditLike ? 0 : grandTotal, credit: isPurchaseLike || isCreditLike ? grandTotal : 0,
    }] : [];
    const payload = {
      voucher_type: voucherType, voucher_date: date, narration: narration || null, reference: reference || null,
      party_id: partyId || null, place_of_supply: party?.state_code || null, document_type: "regular",
      counterparty_gstin: party?.gstin || null, counterparty_state_code: party?.state_code || null,
      round_off_to: roundOffTo, lines: [...itemLines, ...counterLines],
    };
    try {
      await api.post("/recurring-templates", { name, voucher_type: voucherType, frequency, next_run_date: new Date().toISOString().split("T")[0], template_payload: payload });
      toast.success("Template saved!");
    } catch (err: any) { toast.error(err?.message || "Failed to save template"); }
  };

  const counterLedgerHint = !counterLedgerId && grandTotal > 0 ? (isPurchaseLike ? "Required for credit entry" : "Required for debit entry") : undefined;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-5 space-y-5">
      <VoucherHeader
        config={config} date={date} onDateChange={handleDateChange} narration={narration} onNarrationChange={setNarration}
        reference={reference} onReferenceChange={setReference} partyId={partyId} onPartyChange={handlePartyChange}
        parties={parties}
        counterLedgerId={counterLedgerId} onCounterLedgerChange={handleCounterLedgerChange}
        counterLedgers={counterLedgers.map((l) => ({ value: l.id, label: l.name }))}
        counterLedgerPlaceholder={`Select ${isPurchaseLike ? "credit" : "debit"} account...`}
        counterLedgerHint={counterLedgerHint} onQuickCreate={onQuickCreate} createdFrom={createdFrom}
        voucherNumber={editingVoucher?.voucher_number}
        suggestedVoucherNumber={!editingVoucher?.id ? suggestedVoucherNumber : undefined}
        onVoucherNumberChange={!editingVoucher?.id ? setCustomVoucherNumber : undefined}
        flowSlot={flowSlot}
      />
      <div>
        <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-blue-500"></span>
          Items
        </h4>
        <ItemLineTable lines={lines} onLinesChange={setLines} stockItems={stockItems} ledgers={ledgers}
          autoLedgerGroup={AUTO_LEDGER_GROUP[voucherType] || "Sales"} showGst={true}
          onQuickCreate={onQuickCreate} createdFrom={createdFrom} />
      </div>
      <VoucherFooter
        subtotal={totals.subtotal} discountTotal={totals.discountTotal} cgstTotal={totals.taxTotal / 2}
        sgstTotal={totals.taxTotal / 2} igstTotal={0} grandTotal={grandTotal} showItemTotals={true}
        roundOffTo={roundOffTo} onRoundOffChange={setRoundOffTo} onSave={handleSave}
        isSubmitting={isSubmitting} error={localError || error} isEditing={!!editingVoucher?.id}
        onSaveAsTemplate={() => showTemplateModal(voucherType, handleSaveAsTemplate)}
      />
      <VoucherTemplateModal />
    </div>
  );
}
