import { useMemo } from "react";
import type { Ledger, StockItem, VoucherLine } from "../types";
import type { HsnSac } from "../../../hooks/useMasterData";
import MasterSelector from "../../../components/master/MasterSelector";

interface ItemLineTableProps {
  lines: VoucherLine[];
  onLinesChange: (lines: VoucherLine[]) => void;
  stockItems: StockItem[];
  ledgers: Ledger[];
  hsnSacList: HsnSac[];
  autoLedgerGroup: string;
  showGst: boolean;
  onQuickCreate?: (entityKey: string, item: any) => void;
  createdFrom?: string;
}

export default function ItemLineTable({
  lines,
  onLinesChange,
  stockItems,
  ledgers,
  hsnSacList,
  autoLedgerGroup,
  showGst,
  onQuickCreate,
  createdFrom,
}: ItemLineTableProps) {
  const currencySymbol = "₹";
  const linesCalc = useMemo(() => {
    return lines.map((line) => {
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
          cgst = showGst ? Number((taxableForGst * (gstRate / 2) / 100).toFixed(2)) : 0;
          sgst = showGst ? Number((taxableForGst * (gstRate / 2) / 100).toFixed(2)) : 0;
        } else {
          lineTotal = inclusiveTotal;
          cgst = gstRate > 0 && showGst ? (lineTotal * (gstRate / 2)) / 100 : 0;
          sgst = gstRate > 0 && showGst ? (lineTotal * (gstRate / 2)) / 100 : 0;
        }

        return {
          ...line,
          line_total: lineTotal,
          cgst,
          sgst,
          igst: cgst + sgst,
        };
      }
      return {
        ...line,
        line_total: null,
        cgst: 0,
        sgst: 0,
        igst: 0,
      };
    });
  }, [lines, stockItems, showGst]);

  const updateLine = (i: number, field: keyof VoucherLine, val: string | number | null | boolean) => {
    const updated = lines.map((l, idx) => {
      if (idx !== i) return l;
      const next = { ...l, [field]: val };
      if (field === "stock_item_id" && val) {
        const ledger = ledgers.find((lg) =>
          lg.name.toLowerCase().includes(autoLedgerGroup.toLowerCase())
        );
        if (ledger) next.ledger_id = ledger.id;
        const item = stockItems.find((s) => s.id === val);
        if (item) {
          next.rate = item.opening_rate;
          next.gst_rate = item.gst_rate;
        }
      }
      if (field === "hsn_sac_id" && typeof val === "string") {
        const hsn = hsnSacList.find((h) => h.id === val);
        if (hsn) next.gst_rate = hsn.gst_rate;
      }
      if (field === "discount_pct" && typeof val === "number") {
        if (l.quantity && l.rate) next.discount_amount = (l.quantity * l.rate * val) / 100;
      }
      return next;
    });
    onLinesChange(updated);
  };

  const addLine = () =>
    onLinesChange([
      ...lines,
      {
        ledger_id: "",
        stock_item_id: null,
        quantity: null,
        rate: null,
        discount_pct: 0,
        discount_amount: 0,
        debit: 0,
        credit: 0,
        line_total: null,
        gst_rate: null,
        is_rate_inclusive: false,
        hsn_sac_id: null,
      },
    ]);

  const removeLine = (i: number) => {
    if (lines.length <= 1) return;
    onLinesChange(lines.filter((_, idx) => idx !== i));
  };

  // Shared grid column definition — used by both header and body rows
  // Columns: delete-btn | item/service | qty | rate | incl | disc% | amount | hsn/sac(cond) | spacer
  const gridCols = showGst
    ? "32px minmax(270px, 1fr) 70px 90px 60px 60px 110px 140px 32px"
    : "32px minmax(270px, 1fr) 70px 90px 60px 60px 110px 32px";

  return (
    <div
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          const t = e.target as HTMLElement;
          if (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") return;
          e.preventDefault();
          addLine();
        }
      }}
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
        {/* Header row — CSS Grid */}
        <div
          className="grid sticky top-0 z-10 bg-slate-50 dark:bg-[#12121a]"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="px-1 py-2"></div>
          <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-left">
            Item / Service
          </div>
          <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right">
            Qty
          </div>
          <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right">
            Rate
          </div>
          <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-center" title="Rate inclusive of tax">
            Incl.
          </div>
          <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right">
            Disc %
          </div>
          <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-right">
            Amount
          </div>
          {showGst && (
            <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-[#94a3b8] whitespace-nowrap text-left">
              HSN/SAC
            </div>
          )}
          <div className="px-1 py-2"></div>
        </div>

        {/* Body rows — CSS Grid */}
        {linesCalc.map((line, i) => (
          <div
            key={i}
            className="grid border-t border-slate-200 dark:border-[#1a1a24]"
            style={{ gridTemplateColumns: gridCols }}
          >
            {/* Delete button */}
            <div className="px-1 py-1">
              {linesCalc.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="text-red-400 hover:text-red-600 text-lg leading-none p-0 w-6 h-6 flex items-center justify-center"
                  title="Remove line"
                  tabIndex={-1}
                >
                  &times;
                </button>
              )}
            </div>

            {/* Item / Service */}
            <div className="px-2 py-1">
              <div data-field={`item_${i}`}>
                <MasterSelector
                  entityKey="stock_item"
                  value={line.stock_item_id || ""}
                  onChange={(v) => updateLine(i, "stock_item_id", v || null)}
                  options={stockItems.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Select..."
                  className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none focus:ring-0"
                  createdFrom={createdFrom}
                  onItemCreated={onQuickCreate ? (item) => onQuickCreate("stock_item", item) : undefined}
                />
              </div>
            </div>

            {/* Qty */}
            <div className="px-2 py-1">
              <div data-field={`qty_${i}`}>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={line.quantity ?? ""}
                  onChange={(e) => updateLine(i, "quantity", e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded border border-slate-300 dark:border-[#3a3a48] bg-white dark:bg-[#16161f] px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Rate */}
            <div className="px-2 py-1">
              <div data-field={`rate_${i}`}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.rate ?? ""}
                  onChange={(e) => updateLine(i, "rate", e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded border border-slate-300 dark:border-[#3a3a48] bg-white dark:bg-[#16161f] px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Inclusive checkbox */}
            <div className="px-2 py-1 text-center">
              <div data-field={`inclusive_${i}`}>
                <input
                  type="checkbox"
                  checked={line.is_rate_inclusive}
                  onChange={(e) => updateLine(i, "is_rate_inclusive", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-[#282832] text-brand-600 focus:ring-brand-500 dark:focus:ring-blue-500/20"
                  title="Rate is inclusive of GST"
                />
              </div>
            </div>

            {/* Discount % */}
            <div className="px-2 py-1">
              <div data-field={`disc_${i}`}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={line.discount_pct || ""}
                  onChange={(e) => updateLine(i, "discount_pct", Number(e.target.value) || 0)}
                  className="w-full rounded border border-slate-300 dark:border-[#3a3a48] bg-white dark:bg-[#16161f] px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Amount */}
            <div className="px-2 py-1 text-right text-sm font-semibold tabular-nums">
              {line.line_total !== null ? `${currencySymbol}${line.line_total.toLocaleString("en-IN")}` : "—"}
            </div>

            {/* HSN/SAC */}
            {showGst && (
              <div className="px-2 py-1">
                <div data-field={`gst_${i}`}>
                  <MasterSelector
                    entityKey="hsn_sac"
                    value={line.hsn_sac_id || ""}
                    onChange={(v) => updateLine(i, "hsn_sac_id", v || null)}
                    options={hsnSacList.map((h) => ({ value: h.id, label: `${h.code} — ${h.gst_rate}%` }))}
                    placeholder="Auto"
                    className="w-36 text-xs font-medium text-slate-700 dark:text-[#f1f5f9]"
                    createdFrom={createdFrom}
                    onItemCreated={onQuickCreate ? (item) => onQuickCreate("hsn_sac", item) : undefined}
                  />
                </div>
              </div>
            )}

            {/* Spacer for last column alignment */}
            <div className="px-1 py-1"></div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addLine}
        className="mt-2 text-xs text-brand-600 hover:text-brand-700 cursor-pointer font-medium inline-flex items-center gap-1"
      >
        <span className="text-sm leading-none">+</span>
        Add Item
      </button>
    </div>
  );
}
