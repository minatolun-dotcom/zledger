import { useEffect, useMemo, useState } from "react";
import { api } from "../../../api/client";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, StockItem, VoucherSummaryData } from "../types";
import { getLedgerGroupType } from "../types";
import { partyByLedgerMap, ledgerOptionLabel } from "../shared/ledgerUtils";
import PurchaseItemTable, { type PurchaseItemLine } from "../shared/PurchaseItemTable";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import { showTemplateModal } from "../../../components/VoucherTemplateModal";
import type { FlowData } from "../shared/TransactionFlow";
interface PurchaseVoucherFormProps {
  ledgers: Ledger[];
  parties: Party[];
  stockItems: StockItem[];
  accountGroups: { id: string; system_code: string | null }[];
  onSubmit: (payload: unknown) => Promise<void>;
  isSubmitting?: boolean;
  error?: string;
  setError?: (msg: string) => void;
  onQuickCreate?: (entityKey: string, item: unknown) => void;
  editingVoucher?: import("../types").Voucher | null;
  onUpdate?: (id: string, payload: unknown) => Promise<void>;
  onFlowChange?: (data: FlowData | null) => void;
  formScopeRef?: React.RefObject<HTMLElement | null>;
  onSummary?: (data: VoucherSummaryData) => void;
}

export default function PurchaseVoucherForm({
  ledgers,
  parties,
  stockItems,
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
  onSummary,
}: PurchaseVoucherFormProps) {
  const [companyStateCode, setCompanyStateCode] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [accountType, setAccountType] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayIso());
  const [reference, setReference] = useState<string>("");
  const [narration, setNarration] = useState<string>("");
  const [lines, setLines] = useState<PurchaseItemLine[]>([{
    ledger_id: "", stock_item_id: null, quantity: null, rate: null,
    discount_pct: 0, discount_amount: 0, line_total: 0, gst_rate: null,
    hsn_sac_id: null, is_rate_inclusive: false, is_reverse_charge: false, cost_centre_id: null
  }]);
  const [paymentMode, setPaymentMode] = useState<string>("Cash");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [suggestedVoucherNumber, setSuggestedVoucherNumber] = useState("");

  useEffect(() => {
    const cid = localStorage.getItem("zledger.companyId");
    if (cid) {
      api.get<{ gst_state_code?: string | null }>(`/companies/${cid}`)
        .then((res: { gst_state_code?: string | null }) => setCompanyStateCode(res.gst_state_code || null))
        .catch(() => {});
    }
  }, []);

  const party = useMemo(() => parties.find(p => p.ledger_id === accountId) || null, [parties, accountId]);
  const partyByLedger = useMemo(() => partyByLedgerMap(parties), [parties]);
  
  const isCreditPurchase = accountType === "sundry_creditors";
  const isCashPurchase = accountType === "cash";
  const isBankPurchase = accountType === "bank";

  const placeOfSupply = isCreditPurchase ? (party?.state_code || null) : companyStateCode;
  const isInterStateTxn = placeOfSupply && companyStateCode && placeOfSupply !== companyStateCode;

  useEffect(() => {
    if (editingVoucher) {
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      setReference(editingVoucher.reference || "");
      const itemLines = (editingVoucher.lines || []).filter(l => l.stock_item_id).map((l: Record<string, unknown>) => ({
        ledger_id: String(l.ledger_id || ""), stock_item_id: String(l.stock_item_id || ""), quantity: Number(l.quantity) || null,
        rate: Number(l.rate) || null, discount_pct: Number(l.discount_pct) || 0, discount_amount: Number(l.discount_amount) || 0,
        line_total: Number(l.line_total) || 0, gst_rate: Number(l.gst_rate) || null, hsn_sac_id: l.hsn_sac_id ? String(l.hsn_sac_id) : null,
        is_rate_inclusive: Boolean(l.is_rate_inclusive), is_reverse_charge: Boolean(l.is_reverse_charge), cost_centre_id: l.cost_centre_id ? String(l.cost_centre_id) : null
      }));
      setLines(itemLines.length > 0 ? itemLines : [{
        ledger_id: "", stock_item_id: null, quantity: null, rate: null,
        discount_pct: 0, discount_amount: 0, line_total: 0, gst_rate: null,
        hsn_sac_id: null, is_rate_inclusive: false, is_reverse_charge: false, cost_centre_id: null
      }]);
      const counterLine = (editingVoucher.lines || []).find(l => !l.stock_item_id && l.credit > 0);
      if (counterLine) {
        setAccountId(counterLine.ledger_id);
        const acc = ledgers.find(l => l.id === counterLine.ledger_id);
        if (acc) setAccountType(ledgerGroupType(acc));
      }
    } else {
      api.get<{ next_number: string }>("/vouchers/next-number?voucher_type=purchase")
        .then((res: { next_number: string }) => { 
          setSuggestedVoucherNumber(res.next_number); 
          setReference(res.next_number); 
        })
        .catch((err) => { console.error("Failed to fetch voucher number:", err); });
    }
  }, [editingVoucher, ledgers]);
  const totals = useMemo(() => {
    let taxable = 0;
    let cgst = 0, sgst = 0, igst = 0;
    let discountTotal = 0;

    lines.forEach(l => {
      if (!l.stock_item_id && l.ledger_id === "") return;
      
      const gross = (l.quantity || 0) * (l.rate || 0);
      const disc = l.discount_pct > 0 ? (gross * l.discount_pct) / 100 : l.discount_amount;
      const taxableAmt = l.is_rate_inclusive && l.gst_rate ? (gross - disc) / (1 + l.gst_rate / 100) : gross - disc;
      const rate = l.gst_rate || 0;
      
      taxable += taxableAmt;
      discountTotal += disc;
      const lineTax = (taxableAmt * rate) / 100;
      
      if (isInterStateTxn) {
        igst += lineTax;
      } else {
        cgst += lineTax / 2;
        sgst += lineTax / 2;
      }
    });

    const grand = taxable + cgst + sgst + igst;
    const rounded = Math.round(grand);
    return { taxable, discountTotal, cgst, sgst, igst, grandTotal: rounded, roundOff: rounded - grand };
  }, [lines, isInterStateTxn]);

  useEffect(() => {
    onSummary?.({
      itemCount: lines.filter(l => l.stock_item_id).length,
      subtotal: totals.taxable + totals.discountTotal,
      discountTotal: totals.discountTotal,
      taxableAmount: totals.taxable,
      cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst,
      roundOff: totals.roundOff !== 0 ? totals.roundOff : null,
      netAmount: totals.grandTotal,
      partyId: party?.id || "",
      fromLedgerId: "", toLedgerId: accountId, amount: totals.grandTotal,
      totalDebit: totals.grandTotal, totalCredit: totals.grandTotal,
    });
  }, [lines, totals, party, accountId, onSummary]);

  useEffect(() => {
    if (onFlowChange) {
      // Build accounting entries for display (Purchase: Dr Purchase/Input GST, Cr Supplier)
      const debitLines = [];
      const creditLines = [{ ledger_id: accountId, amount: totals.grandTotal }];
      
      // Purchase ledger (main)
      const defaultPurchaseLedgerId = ledgers.find(l => l.name.toLowerCase().includes("purchase"))?.id || "";
      if (defaultPurchaseLedgerId && totals.taxable > 0) {
        debitLines.push({ ledger_id: defaultPurchaseLedgerId, amount: totals.taxable });
      }
      
      // Input GST
      if (totals.cgst > 0) {
        const cgstLedgerId = ledgers.find(l => l.name.toLowerCase().includes("input cgst"))?.id || "";
        if (cgstLedgerId) debitLines.push({ ledger_id: cgstLedgerId, amount: totals.cgst });
      }
      if (totals.sgst > 0) {
        const sgstLedgerId = ledgers.find(l => l.name.toLowerCase().includes("input sgst"))?.id || "";
        if (sgstLedgerId) debitLines.push({ ledger_id: sgstLedgerId, amount: totals.sgst });
      }
      if (totals.igst > 0) {
        const igstLedgerId = ledgers.find(l => l.name.toLowerCase().includes("input igst"))?.id || "";
        if (igstLedgerId) debitLines.push({ ledger_id: igstLedgerId, amount: totals.igst });
      }
      
      onFlowChange({
        voucherType: "purchase",
        partyName: party?.name,
        toLedgerId: accountId,
        amount: totals.grandTotal,
        debitLines,
        creditLines,
      });
    }
  }, [party, accountId, totals, ledgers, onFlowChange]);

  const handleSave = async () => {
    if (!accountId) { setError?.("Please select an account"); return; }
    if (lines.every(l => !l.stock_item_id && l.ledger_id === "")) { setError?.("Add at least one item"); return; }
    
    const defaultPurchaseLedgerId = ledgers.find(l => l.name.toLowerCase().includes("purchase"))?.id || "";

    const itemLines = lines.filter(l => l.stock_item_id || l.ledger_id).map(l => {
      const gross = (l.quantity || 0) * (l.rate || 0);
      const disc = l.discount_pct > 0 ? (gross * l.discount_pct) / 100 : l.discount_amount;
      const taxableAmt = l.is_rate_inclusive && l.gst_rate ? (gross - disc) / (1 + l.gst_rate / 100) : gross - disc;

      return {
        ledger_id: l.ledger_id || defaultPurchaseLedgerId,
        stock_item_id: l.stock_item_id,
        quantity: l.quantity,
        rate: l.rate,
        discount_pct: l.discount_pct,
        discount_amount: l.discount_amount,
        gst_rate: l.gst_rate,
        is_rate_inclusive: l.is_rate_inclusive,
        is_reverse_charge: l.is_reverse_charge,
        hsn_sac_id: l.hsn_sac_id,
        // tax-exclusive; GST lines are derived server-side
        debit: taxableAmt,
        credit: 0,
        cost_centre_id: l.cost_centre_id,
      };
    });

    const counterLine = {
      ledger_id: accountId,
      debit: 0,
      credit: totals.grandTotal,
    };

    // GST lines are derived server-side for item vouchers; only add round-off.
    const extraLines = [];
    if (Math.abs(totals.roundOff) > 0.001) {
      const roundOffLedger = ledgers.find(l => l.name.toLowerCase().includes("round"))?.id || "";
      extraLines.push({
        ledger_id: roundOffLedger,
        debit: totals.roundOff > 0 ? totals.roundOff : 0,
        credit: totals.roundOff < 0 ? Math.abs(totals.roundOff) : 0,
      });
    }

    const payload = {
      voucher_type: "purchase",
      voucher_date: date,
      party_id: party?.id || null,
      place_of_supply: placeOfSupply,
      reference,
      narration,
      lines: [...itemLines, ...extraLines, counterLine],
    };

    try {
      if (editingVoucher?.id && onUpdate) {
        await onUpdate(editingVoucher.id, payload);
      } else {
        await onSubmit(payload);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save voucher";
      setError?.(msg);
    }
  };

  const fieldOrder = ["date", "account", "narration"];
  useVoucherKeyboard({ fieldOrder, onSave: handleSave, isSubmitting, scopeRef: formScopeRef });
  useEffect(() => { focusFirstField(fieldOrder); }, []);

  const groupCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of accountGroups) { if (g.system_code) map.set(g.id, g.system_code); }
    return map;
  }, [accountGroups]);

  const ledgerGroupType = (ledger: Ledger | undefined) => getLedgerGroupType(ledger ? groupCodeMap.get(ledger.group_id) : null);

  const filteredLedgers = ledgers.filter(l => 
    ["sundry_creditors", "cash", "bank"].includes(ledgerGroupType(l))
  );

  return (
    <div className="space-y-3" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      {/* Top: Horizontal voucher info (Date, Voucher No, Supplier Account) */}
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
            <DateInput value={date} onChange={setDate} data-field="date" />
          </div>
          {/* Voucher No */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Voucher No.</label>
            <div className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9] h-[38px] flex items-center">
              {editingVoucher?.voucher_number || suggestedVoucherNumber || "—"}
            </div>
          </div>
          {/* Supplier Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Supplier Account</label>
            <div data-field="account">
              <MasterSelector
                entityKey="ledger"
                value={accountId}
                onChange={(id: string) => {
                  setAccountId(id);
                  const acc = ledgers.find(l => l.id === id);
                  if (acc) setAccountType(ledgerGroupType(acc));
                }}
                options={filteredLedgers.map(l => ({ value: l.id, label: ledgerOptionLabel(l, partyByLedger) }))}
                placeholder="Select supplier / cash / bank..."
              />
            </div>
          </div>
        </div>
        {/* Payment mode for cash/bank purchases (inline below main fields) */}
        {(isCashPurchase || isBankPurchase) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-[#282832]">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a24]">
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="RTGS">RTGS</option>
                <option value="NEFT">NEFT</option>
              </select>
            </div>
            {isBankPurchase && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Cheque / UTR No.</label>
                <input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)}
                  placeholder="Reference number"
                  className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a24]" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: Full-width item table + Narration */}
      <div className="space-y-3">
        <PurchaseItemTable
          lines={lines}
          onChange={setLines}
          stockItems={stockItems}
          ledgers={ledgers}
          onQuickCreate={onQuickCreate}
          isInterState={isInterStateTxn ? true : false}
        />
        <div data-field="narration">
          <textarea value={narration} onChange={e => setNarration(e.target.value)}
            placeholder="Narration..." rows={4}
            className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg p-2 bg-white dark:bg-[#1a1a24]" />
        </div>
        {/* Action buttons below narration */}
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={isSubmitting}
            className="px-6 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-lg shadow-lg transition-all disabled:opacity-50">
            {isSubmitting ? "Saving..." : editingVoucher?.id ? "Update Purchase" : "Save Purchase"}
          </button>
          <button onClick={() => showTemplateModal("purchase", async () => {})}
            className="px-4 border border-slate-300 dark:border-[#282832] text-slate-700 dark:text-[#cbd5e1] py-2.5 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-[#282832]/40">
            Template
          </button>
        </div>
        {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
      </div>
    </div>
  );
}