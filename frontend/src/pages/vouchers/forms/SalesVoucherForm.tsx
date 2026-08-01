import { useEffect, useMemo, useState } from "react";
import { api } from "../../../api/client";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, StockItem, VoucherSummaryData } from "../types";
import { getLedgerGroupType } from "../types";
import { partyByLedgerMap, ledgerOptionLabel } from "../shared/ledgerUtils";
import { useHsnSac } from "../../../hooks/useMasterData";
import SalesItemTable, { type SalesItemLine } from "../shared/SalesItemTable";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import { showTemplateModal } from "../../../components/VoucherTemplateModal";
import type { FlowData } from "../shared/TransactionFlow";

interface SalesVoucherFormProps {
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

export default function SalesVoucherForm({
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
}: SalesVoucherFormProps) {
  const { data: hsnSacList = [] } = useHsnSac();

  const [companyStateCode, setCompanyStateCode] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [accountType, setAccountType] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayIso());
  const [reference, setReference] = useState<string>("");
  const [narration, setNarration] = useState<string>("");
  const [lines, setLines] = useState<SalesItemLine[]>([{
    ledger_id: "", stock_item_id: null, quantity: null, rate: null,
    discount_pct: 0, discount_amount: 0, line_total: 0, gst_rate: null,
    hsn_sac_id: null, is_rate_inclusive: false
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
  
  const isCreditSale = accountType === "sundry_debtors";
  const isCashSale = accountType === "cash";
  const isBankSale = accountType === "bank";

  const placeOfSupply = isCreditSale ? (party?.state_code || null) : companyStateCode;
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
        is_rate_inclusive: Boolean(l.is_rate_inclusive)
      }));
      setLines(itemLines.length > 0 ? itemLines : [{
        ledger_id: "", stock_item_id: null, quantity: null, rate: null,
        discount_pct: 0, discount_amount: 0, line_total: 0, gst_rate: null,
        hsn_sac_id: null, is_rate_inclusive: false
      }]);
      const counterLine = (editingVoucher.lines || []).find(l => !l.stock_item_id && l.debit > 0);
      if (counterLine) {
        setAccountId(counterLine.ledger_id);
        const acc = ledgers.find(l => l.id === counterLine.ledger_id);
        if (acc) setAccountType(ledgerGroupType(acc));
      }
    } else {
      const fyId = localStorage.getItem("zledger.fyId");
      if (fyId) {
        api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=sales&financial_year_id=${fyId}`)
          .then((res: { next_number: string }) => { 
            setSuggestedVoucherNumber(res.next_number); 
            setReference(res.next_number); 
          })
          .catch((err) => { console.error("Failed to fetch voucher number:", err); });
      }
    }
  }, [editingVoucher, ledgers]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let discTotal = 0;
    let cgst = 0, sgst = 0, igst = 0;

    lines.forEach(l => {
      const gross = (l.quantity || 0) * (l.rate || 0);
      const disc = l.discount_pct > 0 ? (gross * l.discount_pct) / 100 : l.discount_amount;
      const taxable = l.is_rate_inclusive && l.gst_rate ? (gross - disc) / (1 + l.gst_rate / 100) : gross - disc;
      const rate = l.gst_rate || 0;
      
      subtotal += taxable;
      discTotal += disc;
      const lineTax = (taxable * rate) / 100;
      if (isInterStateTxn) { igst += lineTax; }
      else { cgst += lineTax / 2; sgst += lineTax / 2; }
    });

    const grand = subtotal + cgst + sgst + igst;
    const rounded = Math.round(grand);
    return { subtotal, discTotal, cgst, sgst, igst, grandTotal: rounded, roundOff: rounded - grand };
  }, [lines, isInterStateTxn]);

  useEffect(() => {
    onSummary?.({
      itemCount: lines.filter(l => l.stock_item_id).length,
      subtotal: totals.subtotal,
      discountTotal: totals.discTotal,
      taxableAmount: totals.subtotal,
      cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst,
      roundOff: totals.roundOff !== 0 ? totals.roundOff : null,
      netAmount: totals.grandTotal,
      partyId: party?.id || "",
      fromLedgerId: accountId, toLedgerId: "", amount: totals.grandTotal,
      totalDebit: totals.grandTotal, totalCredit: 0,
    });
  }, [lines, totals, party, accountId, onSummary]);

  useEffect(() => {
    if (onFlowChange) {
      // Build accounting entries for display
      const debitLines = [{ ledger_id: accountId, amount: totals.grandTotal }];
      const creditLines = [];
      
      // Sales ledger (main)
      const defaultSalesLedgerId = ledgers.find(l => l.name.toLowerCase() === "sales")?.id || "";
      if (defaultSalesLedgerId && totals.subtotal > 0) {
        creditLines.push({ ledger_id: defaultSalesLedgerId, amount: totals.subtotal });
      }
      
      // GST output
      if (totals.cgst > 0) {
        const cgstLedgerId = ledgers.find(l => l.name.toLowerCase().includes("output cgst"))?.id || "";
        if (cgstLedgerId) creditLines.push({ ledger_id: cgstLedgerId, amount: totals.cgst });
      }
      if (totals.sgst > 0) {
        const sgstLedgerId = ledgers.find(l => l.name.toLowerCase().includes("output sgst"))?.id || "";
        if (sgstLedgerId) creditLines.push({ ledger_id: sgstLedgerId, amount: totals.sgst });
      }
      if (totals.igst > 0) {
        const igstLedgerId = ledgers.find(l => l.name.toLowerCase().includes("output igst"))?.id || "";
        if (igstLedgerId) creditLines.push({ ledger_id: igstLedgerId, amount: totals.igst });
      }
      
      onFlowChange({
        voucherType: "sales",
        partyName: party?.name,
        fromLedgerId: accountId,
        amount: totals.grandTotal,
        debitLines,
        creditLines,
      });
    }
  }, [party, accountId, totals, ledgers, onFlowChange]);

  const handleSave = async () => {
    if (!accountId) { setError?.("Please select an account"); return; }
    if (lines.every(l => !l.stock_item_id)) { setError?.("Add at least one item"); return; }
    
    const defaultSalesLedgerId = ledgers.find(l => l.name.toLowerCase() === "sales")?.id || "";

    const itemLines = lines.filter(l => l.stock_item_id).map(l => ({
      ledger_id: l.ledger_id || defaultSalesLedgerId,
      stock_item_id: l.stock_item_id,
      quantity: l.quantity,
      rate: l.rate,
      discount_pct: l.discount_pct,
      discount_amount: l.discount_amount,
      gst_rate: l.gst_rate,
      is_rate_inclusive: l.is_rate_inclusive,
      hsn_sac_id: l.hsn_sac_id,
      credit: l.line_total,
      debit: 0,
    }));

    const counterLine = { ledger_id: accountId, debit: totals.grandTotal, credit: 0 };

    // GST lines are derived server-side for item vouchers; only add round-off.
    const extraLines = [];
    if (Math.abs(totals.roundOff) > 0.001) {
      const roundOffLedger = ledgers.find(l => l.name.toLowerCase().includes("round"))?.id || "";
      extraLines.push({
        ledger_id: roundOffLedger,
        credit: totals.roundOff > 0 ? totals.roundOff : 0,
        debit: totals.roundOff < 0 ? Math.abs(totals.roundOff) : 0,
      });
    }

    const payload = {
      voucher_type: "sales",
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
    ["sundry_debtors", "cash", "bank"].includes(ledgerGroupType(l))
  );

  return (
    <div className="space-y-3" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      {/* Top: Horizontal voucher info (Date, Voucher No, Party Account) */}
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
          {/* Party Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Party Account</label>
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
                placeholder="Select party / cash / bank..."
              />
            </div>
          </div>
        </div>
        {/* Payment mode for cash/bank sales (inline below main fields) */}
        {(isCashSale || isBankSale) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-[#282832]">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a24]">
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
            {isBankSale && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">Ref/UTR No.</label>
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
        <SalesItemTable
          lines={lines} onChange={setLines} stockItems={stockItems}
          ledgers={ledgers} hsnSacList={hsnSacList}
          onQuickCreate={onQuickCreate} createdFrom="Sales"
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
            {isSubmitting ? "Saving..." : editingVoucher?.id ? "Update Sale" : "Save Sale"}
          </button>
          <button onClick={() => showTemplateModal("sales", async () => {})}
            className="px-4 border border-slate-300 dark:border-[#282832] text-slate-700 dark:text-[#cbd5e1] py-2.5 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-[#282832]/40">
            Template
          </button>
        </div>
        {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
      </div>
    </div>
  );
}