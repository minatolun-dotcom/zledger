import { getVoucherConfig } from "../types";
import type { VoucherSummaryData, Party, Ledger } from "../types";
import { INDIAN_STATES } from "../../../components/IndianStates";
import TransactionFlow from "./TransactionFlow";
import type { FlowData } from "./TransactionFlow";
import { usePartyOutstanding } from "./usePartyOutstanding";

interface VoucherSidebarProps {
  summary: VoucherSummaryData;
  parties: Party[];
  voucherType: string;
  flowData?: FlowData | null;
  ledgers?: Ledger[];
}

function getPartyTypeLabel(voucherType: string, partyType: string): string {
  if (partyType === "customer") {
    if (["sales", "credit_note", "receipt"].includes(voucherType)) return "Customer";
    return "Customer";
  }
  if (partyType === "supplier") {
    if (["purchase", "debit_note", "payment"].includes(voucherType)) return "Supplier";
    return "Supplier";
  }
  return "";
}

function stateName(code: string | null | undefined): string {
  if (!code) return "—";
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? code;
}

export default function VoucherSidebar({
  summary, parties, voucherType, flowData, ledgers = [],
}: VoucherSidebarProps) {
  const config = getVoucherConfig(voucherType);
  const showGst = summary.itemCount > 0 || summary.cgst > 0 || summary.sgst > 0;
  const showItems = summary.itemCount > 0;
  const totalGst = summary.cgst + summary.sgst + summary.igst;
  const gstRate = summary.taxableAmount > 0 ? Math.round((totalGst / summary.taxableAmount) * 100) : 0;

  // ── Party details ─────────────────────────────────────────────────────
  const selectedParty = summary.partyId ? parties.find((p) => p.id === summary.partyId) : undefined;

  const outstanding = usePartyOutstanding(selectedParty);

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const voucherLabel = config?.label ?? voucherType;

  return (
    <div className="space-y-4">
      {/* ── Voucher Summary Card ──────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-2 text-xs sticky top-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Voucher Summary</h3>

        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-[#64748b]">Voucher Type</span>
          <span className="font-medium text-slate-900 dark:text-[#f1f5f9]">{voucherLabel}</span>
        </div>

        {showItems && (
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-[#64748b]">Items</span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">{summary.itemCount}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-[#64748b]">Subtotal</span>
          <span className="font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">{fmt(summary.subtotal)}</span>
        </div>

        {(summary.discountTotal > 0 || showItems) && (
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-[#64748b]">Discount</span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">{fmt(summary.discountTotal)}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-[#64748b]">Taxable</span>
          <span className="font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">{fmt(summary.taxableAmount)}</span>
        </div>

        {showGst && <>
          <div className="pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b]">GST{gstRate > 0 ? ` @${gstRate}%` : ''}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-[#64748b]">CGST</span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">{fmt(summary.cgst)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-[#64748b]">SGST</span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">{fmt(summary.sgst)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-[#64748b]">IGST</span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">{fmt(summary.igst)}</span>
          </div>
        </>}

        {summary.roundOff !== null && (
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-[#64748b]">Round Off</span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-[#f1f5f9]">{fmt(summary.roundOff)}</span>
          </div>
        )}

        <hr className="border-slate-200 dark:border-[#282832]" />

        <div className="flex justify-between">
          <span className="text-slate-700 dark:text-[#cbd5e1] font-semibold">Grand Total</span>
          <span className="font-mono tabular-nums text-base font-bold text-blue-600 dark:text-blue-400">{fmt(summary.netAmount)}</span>
        </div>
      </div>

      {/* ── Transaction Flow Card ────────────────────────────────────── */}
      {flowData && (
        <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-2 text-xs sticky top-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Transaction Flow</h3>
          <div className="flex flex-col items-center gap-2 py-2">
            <TransactionFlow {...flowData} ledgers={ledgers} vertical />
          </div>
        </div>
      )}

      {/* ── Party Details Card ────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-2 text-xs sticky top-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9]">Party Details</h3>

        {!selectedParty ? (
          <p className="text-slate-400 dark:text-[#64748b] italic">Select a party to view details</p>
        ) : (
          <>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">{selectedParty.name}</p>
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-[#282832] px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-[#94a3b8]">
                {getPartyTypeLabel(voucherType, selectedParty.party_type)}
              </span>
            </div>

            {selectedParty.gstin && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b]">GSTIN</span>
                <p className="font-mono text-xs text-slate-900 dark:text-[#f1f5f9]">{selectedParty.gstin}</p>
              </div>
            )}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b]">State</span>
              <p className="text-xs text-slate-900 dark:text-[#f1f5f9]">{stateName(selectedParty.state_code)}</p>
            </div>

            {selectedParty.address && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b]">Address</span>
                <p className="text-xs text-slate-900 dark:text-[#f1f5f9]">{selectedParty.address}</p>
              </div>
            )}

            {outstanding && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#64748b]">Outstanding</span>
                <p className="font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-[#f1f5f9]">
                  {fmt(outstanding.balance)} {outstanding.type}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
