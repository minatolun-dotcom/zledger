import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, StockItem, VoucherLine } from "../types";
import { getVoucherConfig, emptyItemLine } from "../types";
import VoucherHeader from "../shared/VoucherHeader";
import ItemLineTable from "../shared/ItemLineTable";
import VoucherFooter from "../shared/VoucherFooter";

interface CurrencyOption { code: string; symbol: string }

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
  editingVoucher?: import("../types").Voucher | null;
  onUpdate?: (id: string, payload: any) => Promise<void>;
}

const AUTO_LEDGER_GROUP: Record<string, string> = {
  sales: "Sales",
  purchase: "Purchase",
  credit_note: "Sales",
  debit_note: "Purchase",
};

export default function ItemVoucherForm({
  voucherType,
  ledgers,
  parties,
  stockItems,
  onSubmit,
  isSubmitting,
  error,
  setError,
  onQuickCreate,
  editingVoucher,
  onUpdate,
}: ItemVoucherFormProps) {
  const config = getVoucherConfig(voucherType);

  const [date, setDate] = useState(todayIso());
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [partyId, setPartyId] = useState("");
  const [documentType, setDocumentType] = useState("regular");
  const [lines, setLines] = useState<VoucherLine[]>([emptyItemLine()]);
  const [counterLedgerId, setCounterLedgerId] = useState("");
  const [roundOffTo, setRoundOffTo] = useState<number | null>(null);
  const [currency, setCurrency] = useState("");
  const [exchangeRate, setExchangeRate] = useState(0);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);

  useEffect(() => {
    api.get<CurrencyOption[]>("/forex/currencies").then(setCurrencies).catch(() => {});
  }, []);

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
      setDocumentType(editingVoucher.document_type || "regular");
      const r = editingVoucher.round_off_to;
      setRoundOffTo(r === 1 || r === 0.5 ? 0 : r);
      const itemLines = (editingVoucher.lines || [])
        .filter((l) => l.stock_item_id)
        .map((l) => {
          let derivedGstRate = null;
          if (l.line_total && l.line_total > 0) {
            const totalGst = (l.cgst_amount || 0) + (l.sgst_amount || 0) + (l.igst_amount || 0);
            if (totalGst > 0) {
              derivedGstRate = Math.round((totalGst / l.line_total) * 100 * 100) / 100;
            }
          }
          return {
            ledger_id: l.ledger_id,
            stock_item_id: l.stock_item_id,
            quantity: l.quantity,
            rate: l.rate,
            discount_pct: l.discount_pct,
            discount_amount: l.discount_amount,
            debit: l.debit,
            credit: l.credit,
            fc_debit: l.fc_debit,
            fc_credit: l.fc_credit,
            line_total: l.line_total,
            gst_rate: derivedGstRate,
            is_rate_inclusive: l.is_rate_inclusive,
          };
        });
      setLines(itemLines.length > 0 ? itemLines : [emptyItemLine()]);
      const counterLine = editingVoucher.lines.find(
        (l) => !l.stock_item_id && !l.hsn_sac_id && (l.debit > 0 || l.credit > 0)
      );
      setCounterLedgerId(counterLine?.ledger_id || "");
      setCurrency(editingVoucher.currency || "");
      setExchangeRate(editingVoucher.exchange_rate || 0);
    } else {
      setDate(todayIso());
      setNarration("");
      setReference("");
      setPartyId("");
      setDocumentType("regular");
      setLines([emptyItemLine()]);
      setCounterLedgerId("");
      setRoundOffTo(null);
      setCurrency("");
      setExchangeRate(0);
      api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`)
        .then((res) => setReference(res.next_number))
        .catch(() => {});
    }
  }, [editingVoucher, voucherType]);

  const counterLedgers = ledgers.filter(
    (l) =>
      l.name === "Cash" ||
      (l.name && l.name.toLowerCase().includes("bank"))
  );

  const linesCalc = lines.map((line) => {
    if (line.stock_item_id && line.quantity && line.rate) {
      const item = stockItems.find((s) => s.id === line.stock_item_id);
      const gross = line.quantity * line.rate;
      const discountAmt =
        line.discount_pct > 0
          ? (gross * line.discount_pct) / 100
          : line.discount_amount;
      const inclusiveTotal = gross - discountAmt;
      const gstRate = line.gst_rate ?? item?.gst_rate ?? 0;

      let lineTotal: number;
      let cgst: number;
      let sgst: number;

      if (line.is_rate_inclusive && gstRate > 0) {
        lineTotal = Number((inclusiveTotal / (1 + gstRate / 100)).toFixed(2));
        const taxableForGst = lineTotal;
        cgst = Number((taxableForGst * (gstRate / 2) / 100).toFixed(2));
        sgst = Number((taxableForGst * (gstRate / 2) / 100).toFixed(2));
      } else {
        lineTotal = inclusiveTotal;
        cgst = gstRate > 0 ? (lineTotal * (gstRate / 2)) / 100 : 0;
        sgst = gstRate > 0 ? (lineTotal * (gstRate / 2)) / 100 : 0;
      }

      return { ...line, discount_amount: discountAmt, line_total: lineTotal, cgst, sgst };
    }
    return { ...line, line_total: null, cgst: 0, sgst: 0 };
  });

  const totals = linesCalc.reduce(
    (acc, l) => {
      if (l.line_total !== null) {
        acc.subtotal += l.line_total;
        acc.discountTotal += l.discount_amount;
        acc.taxTotal += (l.cgst ?? 0) + (l.sgst ?? 0);
      }
      return acc;
    },
    { subtotal: 0, discountTotal: 0, taxTotal: 0 }
  );

  const rawGrandTotal = totals.subtotal + totals.taxTotal;
  let grandTotal: number;
  if (roundOffTo === null) {
    grandTotal = Number(rawGrandTotal.toFixed(2));
  } else if (roundOffTo === 0) {
    grandTotal = Math.round(rawGrandTotal);
  } else if (roundOffTo === 1) {
    grandTotal = Math.ceil(rawGrandTotal);
  } else {
    grandTotal = Math.floor(rawGrandTotal);
  }

  const isPurchaseLike = voucherType === "purchase" || voucherType === "debit_note";
  const isCreditLike = voucherType === "credit_note" || voucherType === "debit_note";

  const resetForm = () => {
    setDate(todayIso());
    setNarration("");
    setReference("");
    setPartyId("");
    setDocumentType("regular");
    setLines([emptyItemLine()]);
    setCounterLedgerId("");
    setRoundOffTo(null);
    setCurrency("");
    setExchangeRate(0);
    api.get<{ next_number: string }>(`/vouchers/next-number?voucher_type=${voucherType}`)
      .then((res) => setReference(res.next_number))
      .catch(() => {});
  };

  const handleSubmit = async () => {
    setError("");

    const party = parties.find((p) => p.id === partyId);
    if (partyId && !party?.state_code) {
      setError("Selected party does not have a registered state. Please update the Party master to add the state before posting.");
      return;
    }

    if (!counterLedgerId && grandTotal > 0) {
      setError(`Please select the ${isPurchaseLike ? "credit" : "debit"} account`);
      return;
    }

    const itemLines = linesCalc
      .filter((l) => l.ledger_id || l.stock_item_id)
      .map((l) => ({
        ledger_id: l.ledger_id,
        stock_item_id: l.stock_item_id,
        quantity: l.quantity,
        rate: l.rate,
        discount_pct: l.discount_pct,
        discount_amount: l.discount_amount,
        gst_rate: l.gst_rate,
        is_rate_inclusive: l.is_rate_inclusive,
      }));

    const counterLines = counterLedgerId
      ? [{
          ledger_id: counterLedgerId,
          stock_item_id: null,
          quantity: null,
          rate: null,
          discount_pct: 0,
          discount_amount: 0,
          gst_rate: null,
          is_rate_inclusive: false,
          debit: isPurchaseLike || isCreditLike ? 0 : grandTotal,
          credit: isPurchaseLike || isCreditLike ? grandTotal : 0,
        }]
      : [];

    const placeOfSupply = party?.state_code || null;
    const baseCurrency = "INR";
    const isForex = currency && currency !== baseCurrency;

    const payload: any = {
      voucher_type: voucherType,
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: partyId || null,
      place_of_supply: placeOfSupply,
      document_type: documentType,
      counterparty_gstin: party?.gstin || null,
      counterparty_state_code: party?.state_code || null,
      round_off_to: roundOffTo,
      currency: isForex ? currency : null,
      exchange_rate: isForex ? exchangeRate : null,
      lines: [...itemLines, ...counterLines],
    };
    if (editingVoucher?.id && onUpdate) {
      await onUpdate(editingVoucher.id, payload);
    } else {
      await onSubmit(payload);
      resetForm();
    }
  };

  const counterLedgerHint = !counterLedgerId && grandTotal > 0
    ? (isPurchaseLike ? "Required for credit entry" : "Required for debit entry")
    : undefined;

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
        documentType={documentType}
        onDocumentTypeChange={setDocumentType}
        parties={parties}
        counterLedgerId={counterLedgerId}
        onCounterLedgerChange={setCounterLedgerId}
        counterLedgers={counterLedgers.map((l) => ({ value: l.id, label: l.name }))}
        counterLedgerPlaceholder={`Select ${isPurchaseLike ? "credit" : "debit"} account...`}
        counterLedgerHint={counterLedgerHint}
        onQuickCreate={onQuickCreate}
        currency={currency}
        onCurrencyChange={setCurrency}
        exchangeRate={exchangeRate}
        onExchangeRateChange={setExchangeRate}
        currencies={currencies}
      />

      <div>
        <h4 className="mb-1 text-[11px] font-semibold text-slate-500 dark:text-[#94a3b8] uppercase tracking-wide">Items</h4>
        <ItemLineTable
          lines={lines}
          onLinesChange={setLines}
          stockItems={stockItems}
          ledgers={ledgers}
          autoLedgerGroup={AUTO_LEDGER_GROUP[voucherType] || "Sales"}
          showGst={true}
          onQuickCreate={onQuickCreate}
          currencySymbol={currencies.find((c) => c.code === currency)?.symbol || "₹"}
        />
      </div>

      <VoucherFooter
        subtotal={totals.subtotal}
        discountTotal={totals.discountTotal}
        cgstTotal={totals.taxTotal / 2}
        sgstTotal={totals.taxTotal / 2}
        igstTotal={0}
        grandTotal={grandTotal}
        showItemTotals={true}
        voucherType={voucherType}
        roundOffTo={roundOffTo}
        onRoundOffChange={setRoundOffTo}
        onSave={handleSubmit}
        isSubmitting={isSubmitting}
        error={error}
        sticky
        isEditing={!!editingVoucher?.id}
        currencySymbol={currencies.find((c) => c.code === currency)?.symbol || "₹"}
      />
    </div>
  );
}
