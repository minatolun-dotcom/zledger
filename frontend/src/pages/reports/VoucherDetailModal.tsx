import { VoucherDetail, fmt, downloadFile, PreviewBtn } from "./shared";

interface VoucherDetailModalProps {
  voucher: VoucherDetail;
  onClose: () => void;
  onPreview: (url: string, title: string) => void;
}

export default function VoucherDetailModal({ voucher, onClose, onPreview }: VoucherDetailModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl mx-4 rounded-xl bg-white dark:bg-[#16161f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9] capitalize">{voucher.voucher_type} — {voucher.voucher_number}</h3>
            <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">{voucher.voucher_date}{voucher.party_name ? ` · ${voucher.party_name}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <PreviewBtn onClick={() => onPreview(`/vouchers/${voucher.id}/pdf`, `${voucher.voucher_type} ${voucher.voucher_number}`)} />
            <button onClick={() => downloadFile(`/vouchers/${voucher.id}/pdf`, `${voucher.voucher_type}-${voucher.voucher_number}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Print PDF</button>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#282832]">Close</button>
          </div>
        </div>
        <div className="px-6 py-4">
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
        </div>
      </div>
    </div>
  );
}
