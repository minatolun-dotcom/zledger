import { OutstandingData, ReportBaseProps, fmt, ReportHeader, ReportActions } from "./shared";

export default function OutstandingReport({ data, onPreview, onDownload }: ReportBaseProps & { data: OutstandingData }) {
  return (
    <div>
      <ReportHeader data={data} />
      <ReportActions financialYearId={data.financial_year_id} title={`Outstanding — ${data.financial_year_name}`} onPreview={onPreview} onDownload={onDownload} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
            Debtors ({data.debtors.length}) — Total: ₹{fmt(data.total_debtors)}
          </h3>
          {data.debtors.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-[#64748b]">No debtors.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                  <th className="pb-1">Party</th>
                  <th className="pb-1 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.debtors.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                    <td className="py-1">{d.party_name}</td>
                    <td className="py-1 text-right">₹{fmt(d.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
            Creditors ({data.creditors.length}) — Total: ₹{fmt(data.total_creditors)}
          </h3>
          {data.creditors.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-[#64748b]">No creditors.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#cbd5e1]">
                  <th className="pb-1">Party</th>
                  <th className="pb-1 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.creditors.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-[#1a1a24]/50">
                    <td className="py-1">{c.party_name}</td>
                    <td className="py-1 text-right">₹{fmt(c.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}