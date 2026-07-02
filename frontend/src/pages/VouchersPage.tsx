import { useEffect, useState, useMemo, type FormEvent } from "react";
import { api } from "../api/client";
import { toDisplayDate, todayIso } from "../utils/dateUtils";
import DateInput from "../components/DateInput";
import Select from "../components/Select";

interface Ledger { id: string; name: string; group_id: string; }
interface Party { id: string; name: string; party_type: string; gstin: string | null; state_code: string | null; ledger_id: string | null; }
interface StockItem { id: string; name: string; gst_rate: number; hsn_sac_code: string | null; unit_of_measure: string; }
interface VoucherLine {
  ledger_id: string;
  stock_item_id: string | null;
  quantity: number | null;
  rate: number | null;
  discount_pct: number;
  discount_amount: number;
  debit: number;
  credit: number;
  line_total: number | null;
}
interface Voucher {
  id: string; voucher_type: string; voucher_number: string;
  voucher_date: string; narration: string | null; reference: string | null;
  party_id: string | null; place_of_supply: string | null;
  subtotal: number; discount_total: number; tax_total: number; grand_total: number;
  counterparty_gstin: string | null; counterparty_state_code: string | null;
  lines: {
    id: string; ledger_id: string; stock_item_id: string | null;
    quantity: number | null; rate: number | null;
    discount_pct: number; discount_amount: number; line_total: number | null;
    debit: number; credit: number; taxable_value: number | null;
    hsn_sac_id: string | null; is_inter_state: boolean;
    cgst_amount: number | null; sgst_amount: number | null; igst_amount: number | null;
  }[];
}

const TYPES = ["sales", "purchase", "journal", "receipt", "payment"] as const;
type VoucherType = typeof TYPES[number];

const STATES = [
  { code: "01", name: "Jammu & Kashmir" }, { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" }, { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" }, { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" }, { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" }, { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" }, { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" }, { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman & Diu" }, { code: "26", name: "Dadra & Nagar Haveli" },
  { code: "27", name: "Maharashtra" }, { code: "28", name: "Andhra Pradesh (old)" },
  { code: "29", name: "Karnataka" }, { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" }, { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" }, { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
];

function emptyLine(): VoucherLine {
  return { ledger_id: "", stock_item_id: null, quantity: null, rate: null, discount_pct: 0, discount_amount: 0, debit: 0, credit: 0, line_total: null };
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeType, setActiveType] = useState<VoucherType>("sales");
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [detailVoucher, setDetailVoucher] = useState<Voucher | null>(null);

  // form state
  const [vDate, setVDate] = useState(todayIso());
  const [vNarration, setVNarration] = useState("");
  const [vReference, setVReference] = useState("");
  const [vPartyId, setVPartyId] = useState("");
  const [vPlaceOfSupply, setVPlaceOfSupply] = useState("");
  const [vLines, setVLines] = useState<VoucherLine[]>([emptyLine(), emptyLine()]);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      api.get<Voucher[]>("/vouchers"),
      api.get<Ledger[]>("/coa/ledgers"),
      api.get<Party[]>("/coa/parties"),
      api.get<StockItem[]>("/inventory/items"),
    ]).then(([v, l, p, s]) => { setVouchers(v); setLedgers(l); setParties(p); setStockItems(s); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const filteredVouchers = useMemo(() => {
    if (filterType === "all") return vouchers;
    return vouchers.filter((v) => v.voucher_type === filterType);
  }, [vouchers, filterType]);

  const isItemBased = activeType === "sales" || activeType === "purchase";

  const vLinesCalc = useMemo(() => {
    return vLines.map((line) => {
      if (line.stock_item_id && line.quantity && line.rate) {
        const item = stockItems.find((s) => s.id === line.stock_item_id);
        const gross = line.quantity * line.rate;
        const discountAmt = line.discount_pct > 0 ? gross * line.discount_pct / 100 : line.discount_amount;
        const lineTotal = gross - discountAmt;
        const gstRate = item?.gst_rate ?? 0;
        const cgst = gstRate > 0 ? lineTotal * (gstRate / 2) / 100 : 0;
        const sgst = gstRate > 0 ? lineTotal * (gstRate / 2) / 100 : 0;
        const igst = 0;
        return { ...line, discount_amount: discountAmt, line_total: lineTotal, cgst, sgst, igst };
      }
      return { ...line, line_total: null, cgst: 0, sgst: 0, igst: 0 };
    });
  }, [vLines, stockItems]);

  const totals = useMemo(() => {
    let subtotal = 0, discountTotal = 0, taxTotal = 0;
    vLinesCalc.forEach((l) => {
      if (l.line_total !== null) {
        subtotal += l.line_total;
        discountTotal += l.discount_amount;
        taxTotal += (l.cgst ?? 0) + (l.sgst ?? 0) + (l.igst ?? 0);
      } else if (l.debit > 0) {
        subtotal += l.debit;
      } else if (l.credit > 0) {
        subtotal += l.credit;
      }
    });
    return { subtotal, discountTotal, taxTotal, grandTotal: subtotal + taxTotal };
  }, [vLinesCalc]);

  const totalDebit = vLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = vLines.reduce((s, l) => s + l.credit, 0);

  const updateLine = (i: number, field: keyof VoucherLine, val: string | number | null) => {
    setVLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const updated = { ...l, [field]: val };
      // Auto-fill ledger when stock item is selected
      if (field === "stock_item_id" && val && isItemBased) {
        const groupName = activeType === "sales" ? "Sales Accounts" : "Purchase Accounts";
        const ledger = ledgers.find((lg) => lg.name === groupName);
        if (ledger) updated.ledger_id = ledger.id;
      }
      // Recalculate discount from pct
      if (field === "discount_pct" && typeof val === "number") {
        if (l.quantity && l.rate) {
          updated.discount_amount = l.quantity * l.rate * val / 100;
        }
      }
      return updated;
    }));
  };

  const addLine = () => setVLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setVLines((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const linesPayload = vLinesCalc
        .filter((l) => l.ledger_id)
        .map((l) => ({
          ledger_id: l.ledger_id,
          stock_item_id: l.stock_item_id || null,
          quantity: l.quantity || null,
          rate: l.rate || null,
          discount_pct: l.discount_pct,
          discount_amount: l.discount_amount,
          debit: isItemBased ? 0 : l.debit,
          credit: isItemBased ? 0 : l.credit,
        }));

      const party = parties.find((p) => p.id === vPartyId);
      const counterpartyGstin = party?.gstin ?? null;
      const counterpartyStateCode = party?.state_code ?? null;

      await api.post("/vouchers", {
        voucher_type: activeType,
        voucher_date: vDate,
        narration: vNarration || null,
        reference: vReference || null,
        party_id: vPartyId || null,
        place_of_supply: vPlaceOfSupply || null,
        counterparty_gstin: counterpartyGstin,
        counterparty_state_code: counterpartyStateCode,
        lines: linesPayload,
      });
      setShowForm(false);
      resetForm();
      refresh();
    } catch (err: any) {
      const detail = err?.detail;
      setError(typeof detail === "string" ? detail : "Failed to create voucher");
    }
  };

  const resetForm = () => {
    setVLines([emptyLine(), emptyLine()]);
    setVNarration("");
    setVReference("");
    setVPartyId("");
    setVPlaceOfSupply("");
    setVDate(todayIso());
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this voucher?")) return;
    try {
      await api.del(`/vouchers/${id}`);
      refresh();
    } catch (err: any) {
      setError(err?.detail || "Failed to delete voucher");
    }
  };

  const handleViewDetail = async (id: string) => {
    try {
      const v = await api.get<Voucher>(`/vouchers/${id}`);
      setDetailVoucher(v);
    } catch (err: any) {
      setError(err?.detail || "Failed to load voucher");
    }
  };

  const partyOptions = [
    { value: "", label: "Select party…" },
    ...parties.map((p) => ({ value: p.id, label: p.name })),
  ];

  const stateOptions = [
    { value: "", label: "Select state…" },
    ...STATES.map((s) => ({ value: s.code, label: s.name })),
  ];

  const stockItemOptions = [
    { value: "", label: "Select item…" },
    ...stockItems.map((s) => ({ value: s.id, label: s.name })),
  ];

  const ledgerOptions = [
    { value: "", label: "Select ledger…" },
    ...ledgers.map((l) => ({ value: l.id, label: l.name })),
  ];

  useEffect(() => {
    if (!detailVoucher) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDetailVoucher(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [detailVoucher]);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h2 className="text-lg font-bold text-slate-900">Vouchers</h2>
        <button
          onClick={() => { setShowForm(!showForm); resetForm(); }}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showForm ? "Cancel" : "+ New Voucher"}
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {/* Detail Modal */}
      {detailVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setDetailVoucher(null); }}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {detailVoucher.voucher_type.toUpperCase()} #{detailVoucher.voucher_number}
              </h3>
              <button onClick={() => setDetailVoucher(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-slate-500">Date:</span> {toDisplayDate(detailVoucher.voucher_date)}</div>
              <div><span className="text-slate-500">Narration:</span> {detailVoucher.narration || "—"}</div>
              <div><span className="text-slate-500">Reference:</span> {detailVoucher.reference || "—"}</div>
            </div>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500 border-b">
                  <th className="pb-1">Item</th><th className="text-right pb-1">Qty</th><th className="text-right pb-1">Rate</th><th className="text-right pb-1">Amount</th><th className="text-right pb-1">GST</th>
                </tr>
              </thead>
              <tbody>
                {detailVoucher.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-1">{ledgers.find((lg) => lg.id === l.ledger_id)?.name || l.ledger_id}</td>
                    <td className="py-1 text-right">{l.quantity ?? "—"}</td>
                    <td className="py-1 text-right">{l.rate ? `₹${l.rate.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="py-1 text-right">{l.line_total ? `₹${l.line_total.toLocaleString("en-IN")}` : l.debit > 0 ? `₹${l.debit.toLocaleString("en-IN")} Dr` : `₹${l.credit.toLocaleString("en-IN")} Cr`}</td>
                    <td className="py-1 text-right text-slate-500">
                      {l.cgst_amount ? `₹${((l.cgst_amount || 0) + (l.sgst_amount || 0) + (l.igst_amount || 0)).toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-sm space-y-1">
              <div>Subtotal: ₹{detailVoucher.subtotal.toLocaleString("en-IN")}</div>
              {detailVoucher.discount_total > 0 && <div>Discount: -₹{detailVoucher.discount_total.toLocaleString("en-IN")}</div>}
              {detailVoucher.tax_total > 0 && <div>GST: ₹{detailVoucher.tax_total.toLocaleString("en-IN")}</div>}
              <div className="font-bold text-base">Grand Total: ₹{detailVoucher.grand_total.toLocaleString("en-IN")}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mt-3 flex gap-1 border-b border-slate-200">
        {["all", ...TYPES].map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 text-xs font-medium capitalize rounded-t-lg transition-colors ${filterType === t ? "bg-white border border-b-0 border-slate-200 text-brand-700" : "text-slate-500 hover:text-slate-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          {/* Type Tabs */}
          <div className="flex gap-1 border-b border-slate-200 pb-2">
            {TYPES.map((t) => (
              <button key={t} type="button" onClick={() => { setActiveType(t); setVLines([emptyLine(), emptyLine()]); }}
                className={`px-3 py-1.5 text-xs font-medium capitalize rounded-lg transition-colors ${activeType === t ? "bg-brand-100 text-brand-700" : "text-slate-500 hover:bg-slate-100"}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Date</label>
              <DateInput value={vDate} onChange={setVDate}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            {(isItemBased || activeType === "receipt" || activeType === "payment") && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Party</label>
                <Select value={vPartyId} onChange={setVPartyId}
                  options={partyOptions}
                  className="mt-1 block w-full" />
              </div>
            )}
            {isItemBased && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Place of Supply</label>
                  <Select value={vPlaceOfSupply} onChange={setVPlaceOfSupply}
                    options={stateOptions}
                    className="mt-1 block w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Reference</label>
                  <input value={vReference} onChange={(e) => setVReference(e.target.value)} placeholder="Invoice number"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </>
            )}
            <div className={isItemBased ? "" : "col-span-2"}>
              <label className="block text-sm font-medium text-slate-700">Narration</label>
              <input value={vNarration} onChange={(e) => setVNarration(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>

          {isItemBased ? (
            /* Item-based table for sales/purchase */
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500">
                    <th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Disc %</th><th className="text-right">Amount</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {vLinesCalc.map((line, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1">
                        <Select value={line.stock_item_id || ""} onChange={(v) => updateLine(i, "stock_item_id", v || null)}
                          options={stockItemOptions}
                          className="w-full" />
                      </td>
                      <td className="py-1">
                        <input type="number" min="0" step="0.001" value={line.quantity ?? ""}
                          onChange={(e) => updateLine(i, "quantity", e.target.value ? Number(e.target.value) : null)}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm" />
                      </td>
                      <td className="py-1">
                        <input type="number" min="0" step="0.01" value={line.rate ?? ""}
                          onChange={(e) => updateLine(i, "rate", e.target.value ? Number(e.target.value) : null)}
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm" />
                      </td>
                      <td className="py-1">
                        <input type="number" min="0" max="100" step="0.01" value={line.discount_pct || ""}
                          onChange={(e) => updateLine(i, "discount_pct", Number(e.target.value) || 0)}
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm" />
                      </td>
                      <td className="py-1 text-right text-sm font-medium">
                        {line.line_total !== null ? `₹${line.line_total.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="py-1 pl-1">
                        {vLinesCalc.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-xs">&times;</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={addLine}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
                + Add Item
              </button>
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>₹{totals.subtotal.toLocaleString("en-IN")}</span></div>
                {totals.discountTotal > 0 && <div className="flex justify-between"><span className="text-slate-600">Discount</span><span className="text-red-600">-₹{totals.discountTotal.toLocaleString("en-IN")}</span></div>}
                {totals.taxTotal > 0 && <div className="flex justify-between"><span className="text-slate-600">GST</span><span>₹{totals.taxTotal.toLocaleString("en-IN")}</span></div>}
                <div className="flex justify-between font-bold border-t border-slate-200 pt-1"><span>Grand Total</span><span>₹{totals.grandTotal.toLocaleString("en-IN")}</span></div>
              </div>
            </>
          ) : (
            /* Debit/Credit table for journal/receipt/payment */
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500">
                    <th>Ledger</th><th className="text-right">Debit (₹)</th><th className="text-right">Credit (₹)</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {vLines.map((line, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1">
                        <Select required value={line.ledger_id} onChange={(v) => updateLine(i, "ledger_id", v)}
                          options={ledgerOptions}
                          className="w-full" />
                      </td>
                      <td className="py-1">
                        <input type="number" min="0" step="0.01" value={line.debit || ""}
                          onChange={(e) => updateLine(i, "debit", Number(e.target.value) || 0)}
                          className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm" />
                      </td>
                      <td className="py-1">
                        <input type="number" min="0" step="0.01" value={line.credit || ""}
                          onChange={(e) => updateLine(i, "credit", Number(e.target.value) || 0)}
                          className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm" />
                      </td>
                      <td className="py-1 pl-2">
                        {vLines.length > 2 && (
                          <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-xs">&times;</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-medium">
                    <td className="py-1">Total</td>
                    <td className="py-1 text-right">₹{totalDebit.toLocaleString("en-IN")}</td>
                    <td className="py-1 text-right">₹{totalCredit.toLocaleString("en-IN")}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <button type="button" onClick={addLine}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
                + Add Line
              </button>
            </>
          )}

          <div className="flex items-center gap-4">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Save as Draft
            </button>
          </div>
        </form>
      )}

      {/* Voucher List */}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                <th className="pb-2">#</th><th className="pb-2">Type</th><th className="pb-2">Date</th>
                <th className="pb-2">Narration</th><th className="pb-2">Total</th><th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVouchers.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => handleViewDetail(v.id)}>
                  <td className="py-2 font-medium text-slate-900">{v.voucher_number}</td>
                  <td className="py-2 capitalize">{v.voucher_type}</td>
                  <td className="py-2 text-slate-600">{toDisplayDate(v.voucher_date)}</td>
                  <td className="py-2 text-slate-600">{v.narration ?? "—"}</td>
                  <td className="py-2 text-slate-900 font-medium">₹{v.grand_total.toLocaleString("en-IN")}</td>
                  <td className="py-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleDelete(v.id)}
                      className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredVouchers.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">No vouchers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
