import { useEffect, useMemo, useState } from "react";
import { api } from "../../../api/client";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, StockItem, VoucherSummaryData } from "../types";
import { LEDGER_GROUP_TYPE_MAP } from "../types";
import PurchaseItemTable, { type PurchaseItemLine } from "../shared/PurchaseItemTable";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import VoucherTemplateModal, { showTemplateModal } from "../../../components/VoucherTemplateModal";
import type { FlowData } from "../shared/TransactionFlow";
interface PurchaseVoucherFormProps {
  ledgers: Ledger[];
  parties: Party[];
  stockItems: StockItem[];
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
        if (acc) setAccountType(LEDGER_GROUP_TYPE_MAP[acc.group_id || ""] || null);
      }
    } else {
      api.get<{ next_number: string }>("/vouchers/next-number?voucher_type=purchase")
        .then((res: { next_number: string }) => { setReference(res.next_number); setSuggestedVoucherNumber(res.next_number); })
        .catch(() => {});
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
      onFlowChange({ voucherType: "purchase", partyName: party?.name, fromLedgerId: "", toLedgerId: accountId, amount: totals.grandTotal });
    }
  }, [party, accountId, totals.grandTotal, onFlowChange]);

  const handleSave = async () => {
    if (!accountId) { setError?.("Please select an account"); return; }
    if (lines.every(l => !l.stock_item_id && l.ledger_id === "")) { setError?.("Add at least one item"); return; }
    
    const defaultPurchaseLedgerId = ledgers.find(l => l.name.toLowerCase().includes("purchase"))?.id || "";

    const itemLines = lines.filter(l => l.stock_item_id || l.ledger_id).map(l => {
      const gross = (l.quantity || 0) * (l.rate || 0);
      const disc = l.discount_pct > 0 ? (gross * l.discount_pct) / 100 : l.discount_amount;
      const taxableAmt = l.is_rate_inclusive && l.gst_rate ? (gross - disc) / (1 + l.gst_rate / 100) : gross - disc;
      const rate = l.gst_rate || 0;
      const taxAmt = (taxableAmt * rate) / 100;
      
      let cgst = 0, sgst = 0, igst = 0;
      if (isInterStateTxn) {
        igst = taxAmt;
      } else {
        cgst = taxAmt / 2;
        sgst = taxAmt / 2;
      }

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
        debit: taxableAmt + cgst + sgst + igst,
        credit: 0,
        cost_centre_id: l.cost_centre_id,
      };
    });

    const gstLines = [];
    if (isInterStateTxn) {
      if (totals.igst > 0) {
        const igstLedger = ledgers.find(l => l.name.toUpperCase() === "INPUT IGST" || l.name.toUpperCase() === "IGST INPUT")?.id || "";
        gstLines.push({ ledger_id: igstLedger, debit: totals.igst, credit: 0 });
      }
    } else {
      if (totals.cgst > 0) {
        const cgstLedger = ledgers.find(l => l.name.toUpperCase() === "INPUT CGST" || l.name.toUpperCase() === "CGST INPUT")?.id || "";
        gstLines.push({ ledger_id: cgstLedger, debit: totals.cgst, credit: 0 });
      }
      if (totals.sgst > 0) {
        const sgstLedger = ledgers.find(l => l.name.toUpperCase() === "INPUT SGST" || l.name.toUpperCase() === "SGST INPUT")?.id || "";
        gstLines.push({ ledger_id: sgstLedger, debit: totals.sgst, credit: 0 });
      }
    }

    const counterLine = {
      ledger_id: accountId,
      debit: 0,
      credit: totals.grandTotal,
    };

    if (Math.abs(totals.roundOff) > 0.001) {
      const roundOffLedger = ledgers.find(l => l.name.toLowerCase().includes("round"))?.id || "";
      gstLines.push({
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
      lines: [...itemLines, ...gstLines, counterLine],
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

  const filteredLedgers = ledgers.filter(l => 
    ["sundry_creditors", "cash", "bank"].includes(LEDGER_GROUP_TYPE_MAP[l.group_id || ""] || "")
  );

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      <div className="w-full lg:w-[280px] shrink-0 space-y-4">
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Purchase Info</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Date</label>
            <DateInput value={date} onChange={setDate} data-field="date" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Voucher No.</label>
            <div className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">
              {editingVoucher?.voucher_number || suggestedVoucherNumber || "—"}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Account</label>
            <div data-field="account">
              <MasterSelector
                entityKey="ledger"
                value={accountId}
                onChange={(id: string) => {
                  setAccountId(id);
                  const acc = ledgers.find(l => l.id === id);
                  if (acc) setAccountType(LEDGER_GROUP_TYPE_MAP[acc.group_id || ""] || null);
                }}
                options={filteredLedgers.map(l => ({ value: l.id, label: l.name }))}
                placeholder="Select Supplier/Cash/Bank..."
              />
            </div>
          </div>
        </div>

        {isCreditPurchase && party && (
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-2">
            <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Supplier Details</h3>
            <div className="text-sm font-medium">{party.name}</div>
            <div className="text-xs text-slate-500">GSTIN: {party.gstin || "Unregistered"}</div>
            <div className="text-xs text-slate-500">State: {party.state_code || "—"}</div>
            <div className="text-xs text-slate-500">
              Place of Supply: {isCreditPurchase ? (party?.state_code || "—") : (companyStateCode || "—")}
            </div>
          </div>
        )}

        {(isCashPurchase || isBankPurchase) && (
          <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">Payment Details</h3>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
              className="w-full text-xs border border-slate-300 dark:border-[#3a3a45] rounded p-1 bg-transparent">
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="UPI">UPI</option>
              <option value="RTGS">RTGS</option>
              <option value="NEFT">NEFT</option>
            </select>
            {isBankPurchase && (
              <input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)}
                placeholder="Cheque / UTR No." className="w-full text-xs border border-slate-300 dark:border-[#3a3a45] rounded p-1 bg-transparent" />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-4">
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
            placeholder="Narration..." rows={2}
            className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg p-2 bg-white dark:bg-[#1a1a24]" />
        </div>
      </div>

      <div className="w-full lg:w-[280px] shrink-0 space-y-4">
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Summary</h3>
          <div className="flex justify-between"><span>Subtotal</span><span>₹{totals.taxable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          {totals.discountTotal > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-₹{totals.discountTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>}
          <div className="flex justify-between"><span>Taxable</span><span>₹{totals.taxable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
          {isInterStateTxn ? <div className="flex justify-between"><span>Input IGST</span><span>₹{totals.igst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            : <><div className="flex justify-between"><span>Input CGST</span><span>₹{totals.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span>Input SGST</span><span>₹{totals.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div></>}
          <div className="flex justify-between border-t border-slate-200 dark:border-[#282832] pt-2 font-bold text-sm">
            <span>Grand Total</span><span className="text-brand-600 dark:text-brand-400">₹{totals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          
          {isCreditPurchase && party && (
            <div className="border-t border-slate-200 dark:border-[#282832] pt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex justify-between"><span>Outstanding</span><span>₹0.00</span></div>
            </div>
          )}
        </div>
        <button onClick={handleSave} disabled={isSubmitting}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-lg shadow-lg transition-all disabled:opacity-50">
          {isSubmitting ? "Saving..." : editingVoucher?.id ? "Update Purchase" : "Save Purchase"}
        </button>
        <button onClick={() => showTemplateModal("purchase", async () => {})}
          className="w-full border border-slate-300 dark:border-[#282832] text-slate-700 dark:text-[#cbd5e1] py-2 rounded-lg text-sm">
          Save Template
        </button>
        {error && <div className="text-red-500 text-xs font-medium text-center">{error}</div>}
      </div>
      <VoucherTemplateModal />
    </div>
  );
}