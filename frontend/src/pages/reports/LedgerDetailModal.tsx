import { LedgerTransactionData, fmt, downloadFile, PreviewBtn } from "./shared";

interface LedgerDetailModalProps {
  ledgerTx: LedgerTransactionData;
  loading: boolean;
  selectedFy: string | null;
  onClose: () => void;
  onVoucherClick: (voucherId: string) => void;
  onPreview: (url: string, title: string) => void;
}

export default function LedgerDetailModal({ ledgerTx, loading, selectedFy, onClose, onVoucherClick, onPreview }: LedgerDetailModalProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-5xl mx-4 rounded-xl bg-white dark:bg-[#16161f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1a1a24] px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-[#f1f5f9]">{ledgerTx.ledger_name}</h3>
            <p className="text-xs text-slate-500 dark:text-[#cbd5e1]">
              Opening: ₹{fmt(ledgerTx.opening_balance)} {ledgerTx.opening_balance_type} &middot;
              Closing: ₹{fmt(ledgerTx.closing_balance)} {ledgerTx.closing_balance_type} &middot;
              Total Dr: ₹{fmt(ledgerTx.total_debit)} &middot; Total Cr: ₹{fmt(ledgerTx.total_credit)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PreviewBtn onClick={() => onPreview(`/reports/ledger-transactions/pdf?ledger_id=${ledgerTx.ledger_id}&financial_year_id=${selectedFy}`, `${ledgerTx.ledger_name} Transactions`)} />
            <button onClick={() => downloadFile(`/reports/ledger-transactions/pdf?ledger_id=${ledgerTx.ledger_id}&financial_year_id=${selectedFy}`, `ledger-${ledgerTx.ledger_name}-${selectedFy?.slice(0,8)}.pdf`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">PDF</button>
            <button onClick={() => downloadFile(`/reports/ledger-transactions/xlsx?ledger_id=${ledgerTx.ledger_id}&financial_year_id=${selectedFy}`, `ledger-${ledgerTx.ledger_name}-${selectedFy?.slice(0,8)}.xlsx`)} className="rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1 text-xs font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-50 dark:hover:bg-[#282832]">Excel</button>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#282832]">Close</button>
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-500 dark:text-[#cbd5e1]">Loading transactions…</p>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-[#16161f]">
                <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1] border-b border-slate-200 dark:border-[#1a1a24]">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Voucher#</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Party</th>
                  <th className="px-4 py-2">Narration</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 dark:border-[#1a1a24]/50 font-medium text-slate-500 dark:text-[#cbd5e1]">
                  <td className="px-4 py-2" colSpan={5}>Opening Balance</td>
                  <td className="px-4 py-2 text-right"></td>
                  <td className="px-4 py-2 text-right"></td>
                  <td className="px-4 py-2 text-right">
                    ₹{fmt(ledgerTx.opening_balance)} {ledgerTx.opening_balance_type}
                  </td>
                </tr>
                {ledgerTx.transactions.map((t, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#282832]/50"
                    onClick={() => onVoucherClick(t.voucher_id)}>
                    <td className="px-4 py-1.5">{t.voucher_date}</td>
                    <td className="px-4 py-1.5 font-medium text-brand-600 dark:text-blue-400">{t.voucher_number}</td>
                    <td className="px-4 py-1.5 capitalize">{t.voucher_type}</td>
                    <td className="px-4 py-1.5 text-slate-600 dark:text-[#cbd5e1]">{t.party_name || "—"}</td>
                    <td className="px-4 py-1.5 text-slate-600 dark:text-[#cbd5e1] max-w-[200px] truncate">{t.narration || "—"}</td>
                    <td className="px-4 py-1.5 text-right">{t.debit > 0 ? `₹${fmt(t.debit)}` : ""}</td>
                    <td className="px-4 py-1.5 text-right">{t.credit > 0 ? `₹${fmt(t.credit)}` : ""}</td>
                    <td className="px-4 py-1.5 text-right">₹{fmt(t.running_balance)}</td>
                  </tr>
                ))}
                {ledgerTx.transactions.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 dark:text-[#64748b]">No transactions in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
