import { useState, useEffect } from "react";
import { VoucherDetail, fmt, downloadFile, PreviewBtn } from "./shared";
import VoucherAuditTimeline from "../../components/vouchers/VoucherAuditTimeline";
import { api } from "../../api/client";

interface VoucherDetailModalProps {
  voucher: VoucherDetail;
  onClose: () => void;
  onPreview: (url: string, title: string) => void;
  /** Click a related voucher → drill down into its detail. */
  onVoucherClick?: (id: string) => void;
  /** Go back one level in the drill-down stack. */
  onBack?: () => void;
}

type TabId = "summary" | "stock" | "gst" | "audit" | "related" | "attachments";

interface RelatedVoucher {
  id: string;
  voucher_type: string;
  voucher_number: string;
  voucher_date: string;
  narration: string | null;
  grand_total: number;
  status: string;
  relationship: "reversal" | "original" | "same_party" | "same_ledger";
}

const RELATIONSHIP_LABELS: Record<string, { label: string; color: string }> = {
  reversal: { label: "Reversal", color: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400" },
  original: { label: "Original", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400" },
  same_party: { label: "Same Party", color: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" },
  same_ledger: { label: "Same Ledger", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400" },
};

export default function VoucherDetailModal({ voucher, onClose, onPreview, onVoucherClick, onBack }: VoucherDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [relatedVouchers, setRelatedVouchers] = useState<RelatedVoucher[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  
  // Determine which tabs to show
  const hasStockLines = voucher.lines.some(l => l.stock_item_id);
  const hasGST = voucher.lines.some(l => l.cgst_amount || l.sgst_amount || l.igst_amount);
  
  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: "summary", label: "Summary", show: true },
    { id: "stock", label: "Stock", show: hasStockLines },
    { id: "gst", label: "GST", show: hasGST },
    { id: "audit", label: "Audit", show: true },
    { id: "related", label: "Related", show: true },
    { id: "attachments", label: "Attachments", show: true },
  ];
  
  const visibleTabs = tabs.filter(t => t.show);
  
  // Load related vouchers when Related tab is opened
  useEffect(() => {
    if (activeTab === "related" && relatedVouchers.length === 0 && !loadingRelated) {
      setLoadingRelated(true);
      api.get<RelatedVoucher[]>(`/vouchers/${voucher.id}/related`)
        .then(setRelatedVouchers)
        .catch(err => console.error("Failed to load related vouchers:", err))
        .finally(() => setLoadingRelated(false));
    }
  }, [activeTab, voucher.id, relatedVouchers.length, loadingRelated]);
  
  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl mx-4 my-8 rounded-xl bg-white dark:bg-[#16161f] shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-6 py-4 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9] capitalize">
              {voucher.voucher_type} — {voucher.voucher_number}
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">
              {voucher.voucher_date}{voucher.party_name ? ` · ${voucher.party_name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
            <PreviewBtn onClick={() => onPreview(`/vouchers/${voucher.id}/pdf`, `${voucher.voucher_type} ${voucher.voucher_number}`)} />
            <button 
              onClick={() => downloadFile(`/vouchers/${voucher.id}/pdf`, `${voucher.voucher_type}-${voucher.voucher_number}.pdf`)}
              className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]"
            >
              Print PDF
            </button>
            <button 
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#282832]"
            >
              Close
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="border-b border-slate-200 dark:border-[#1a1a24] px-6 shrink-0">
          <div className="flex gap-1">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-brand-600 text-brand-600 dark:text-brand-400"
                    : "border-transparent text-slate-600 dark:text-[#94a3b8] hover:text-slate-900 dark:hover:text-[#f1f5f9]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Tab Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {activeTab === "summary" && <SummaryTab voucher={voucher} />}
          {activeTab === "stock" && <StockTab voucher={voucher} />}
          {activeTab === "gst" && <GSTTab voucher={voucher} />}
          {activeTab === "audit" && <AuditTab voucherId={voucher.id} />}
          {activeTab === "related" && (
            <RelatedTab 
              vouchers={relatedVouchers} 
              loading={loadingRelated}
              onVoucherClick={(id) => {
                if (onVoucherClick) onVoucherClick(id);
              }}
            />
          )}
          {activeTab === "attachments" && <AttachmentsTab voucherId={voucher.id} />}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function SummaryTab({ voucher }: { voucher: VoucherDetail }) {
  return (
    <>
      {voucher.narration && (
        <p className="mb-4 text-sm text-slate-600 dark:text-[#cbd5e1] italic">{voucher.narration}</p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1] border-b border-slate-200 dark:border-[#1a1a24]">
            <th className="pb-2">Ledger</th>
            <th className="pb-2 text-right">Debit</th>
            <th className="pb-2 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {voucher.lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]/50">
              <td className="py-1.5">{l.ledger_name}</td>
              <td className="py-1.5 text-right">{l.debit > 0 ? `₹${fmt(l.debit)}` : ""}</td>
              <td className="py-1.5 text-right">{l.credit > 0 ? `₹${fmt(l.credit)}` : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium border-t-2 border-slate-300 dark:border-[#282832]">
            <td className="pt-2">Total</td>
            <td className="pt-2 text-right">₹{fmt(voucher.lines.reduce((s, l) => s + l.debit, 0))}</td>
            <td className="pt-2 text-right">₹{fmt(voucher.lines.reduce((s, l) => s + l.credit, 0))}</td>
          </tr>
          {voucher.grand_total > 0 && (
            <tr className="font-bold">
              <td className="pt-1">Grand Total</td>
              <td colSpan={2} className="pt-1 text-right">₹{fmt(voucher.grand_total)}</td>
            </tr>
          )}
        </tfoot>
      </table>
    </>
  );
}

function StockTab({ voucher }: { voucher: VoucherDetail }) {
  const stockLines = voucher.lines.filter(l => l.stock_item_id);
  
  if (stockLines.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-[#94a3b8]">No stock items in this voucher.</p>;
  }
  
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1] border-b border-slate-200 dark:border-[#1a1a24]">
          <th className="pb-2">Item</th>
          <th className="pb-2 text-right">Quantity</th>
          <th className="pb-2 text-right">Rate</th>
          <th className="pb-2 text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {stockLines.map((l, i) => (
          <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]/50">
            <td className="py-2">{l.ledger_name}</td>
            <td className="py-2 text-right">{l.quantity ? l.quantity.toFixed(2) : "-"}</td>
            <td className="py-2 text-right">{l.rate ? `₹${fmt(l.rate)}` : "-"}</td>
            <td className="py-2 text-right">₹{fmt(l.line_total || 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GSTTab({ voucher }: { voucher: VoucherDetail }) {
  const gstLines = voucher.lines.filter(l => l.cgst_amount || l.sgst_amount || l.igst_amount);
  
  if (gstLines.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-[#94a3b8]">No GST in this voucher.</p>;
  }
  
  const totalCGST = gstLines.reduce((s, l) => s + (l.cgst_amount || 0), 0);
  const totalSGST = gstLines.reduce((s, l) => s + (l.sgst_amount || 0), 0);
  const totalIGST = gstLines.reduce((s, l) => s + (l.igst_amount || 0), 0);
  const totalGST = totalCGST + totalSGST + totalIGST;
  
  return (
    <>
      {voucher.place_of_supply && (
        <div className="mb-4 text-sm">
          <span className="font-medium text-slate-700 dark:text-[#cbd5e1]">Place of Supply:</span>{" "}
          <span className="text-slate-600 dark:text-[#94a3b8]">{voucher.place_of_supply}</span>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1] border-b border-slate-200 dark:border-[#1a1a24]">
            <th className="pb-2">Item</th>
            <th className="pb-2 text-right">Taxable</th>
            <th className="pb-2 text-right">CGST</th>
            <th className="pb-2 text-right">SGST</th>
            <th className="pb-2 text-right">IGST</th>
            <th className="pb-2 text-right">Total GST</th>
          </tr>
        </thead>
        <tbody>
          {gstLines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]/50">
              <td className="py-2">{l.ledger_name}</td>
              <td className="py-2 text-right">₹{fmt(l.taxable_value || 0)}</td>
              <td className="py-2 text-right">{l.cgst_amount ? `₹${fmt(l.cgst_amount)}` : "-"}</td>
              <td className="py-2 text-right">{l.sgst_amount ? `₹${fmt(l.sgst_amount)}` : "-"}</td>
              <td className="py-2 text-right">{l.igst_amount ? `₹${fmt(l.igst_amount)}` : "-"}</td>
              <td className="py-2 text-right">
                ₹{fmt((l.cgst_amount || 0) + (l.sgst_amount || 0) + (l.igst_amount || 0))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium border-t-2 border-slate-300 dark:border-[#282832]">
            <td className="pt-2">Total</td>
            <td className="pt-2 text-right">₹{fmt(gstLines.reduce((s, l) => s + (l.taxable_value || 0), 0))}</td>
            <td className="pt-2 text-right">{totalCGST > 0 ? `₹${fmt(totalCGST)}` : "-"}</td>
            <td className="pt-2 text-right">{totalSGST > 0 ? `₹${fmt(totalSGST)}` : "-"}</td>
            <td className="pt-2 text-right">{totalIGST > 0 ? `₹${fmt(totalIGST)}` : "-"}</td>
            <td className="pt-2 text-right">₹{fmt(totalGST)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function AuditTab({ voucherId }: { voucherId: string }) {
  return (
    <div className="max-w-2xl">
      <VoucherAuditTimeline voucherId={voucherId} />
    </div>
  );
}

function RelatedTab({ 
  vouchers, 
  loading,
  onVoucherClick 
}: { 
  vouchers: RelatedVoucher[]; 
  loading: boolean;
  onVoucherClick: (id: string) => void;
}) {
  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-[#94a3b8]">Loading related transactions...</p>;
  }
  
  if (vouchers.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-[#94a3b8]">No related transactions found.</p>;
  }
  
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1] border-b border-slate-200 dark:border-[#1a1a24]">
          <th className="pb-2">Type</th>
          <th className="pb-2">Number</th>
          <th className="pb-2">Date</th>
          <th className="pb-2">Narration</th>
          <th className="pb-2 text-right">Amount</th>
          <th className="pb-2">Relationship</th>
        </tr>
      </thead>
      <tbody>
        {vouchers.map((v) => {
          const rel = RELATIONSHIP_LABELS[v.relationship] || { label: v.relationship, color: "bg-gray-100 text-gray-700" };
          return (
            <tr 
              key={v.id}
              onClick={() => onVoucherClick(v.id)}
              className="border-b border-slate-100 dark:border-[#1a1a24]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1a1a24]"
            >
              <td className="py-2 capitalize">{v.voucher_type}</td>
              <td className="py-2 font-medium">{v.voucher_number}</td>
              <td className="py-2">{v.voucher_date}</td>
              <td className="py-2 text-slate-600 dark:text-[#94a3b8] truncate max-w-[200px]">
                {v.narration || "-"}
              </td>
              <td className="py-2 text-right">₹{fmt(v.grand_total)}</td>
              <td className="py-2">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${rel.color}`}>
                  {rel.label}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AttachmentsTab({ voucherId }: { voucherId: string }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-slate-500 dark:text-[#94a3b8] mb-4">
        Attachments feature will be enhanced with drag-and-drop upload.
      </p>
      <p className="text-xs text-slate-400 dark:text-[#64748b]">
        Voucher ID: {voucherId}
      </p>
    </div>
  );
}
