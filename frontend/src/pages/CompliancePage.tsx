import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { toDisplayDate } from "../utils/dateUtils";
import Select from "../components/Select";

interface GstReturn {
  id: string; return_type: string; period: string; status: string;
  gstin: string | null; filed_date: string | null; ack_number: string | null;
}

interface GstRegistration { id: string; gstin: string; legal_name: string; is_primary: boolean; }

interface B2BInvoice {
  gstin: string; place_of_supply: string; invoice_number: string; invoice_date: string;
  invoice_value: number; taxable_value: number; cgst: number; sgst: number; igst: number;
  reverse_charge: boolean;
}

interface B2CSInvoice {
  place_of_supply: string; rate: number; taxable_value: number; cgst: number; sgst: number; igst: number;
}

interface HsnSummary {
  hsn_code: string; description: string; uom: string; taxable_value: number;
  cgst: number; sgst: number; igst: number; total_value: number;
}

interface Gstr1Data {
  period: string; gstin: string; b2b: B2BInvoice[]; b2cs: B2CSInvoice[]; hsn: HsnSummary[];
  total_b2b_taxable: number; total_b2cs_taxable: number; total_cgst: number; total_sgst: number; total_igst: number;
}

interface Gstr3bData {
  period: string; gstin: string; taxable_value: number; cgst_payable: number; sgst_payable: number; igst_payable: number;
  reverse_charge_taxable: number; reverse_charge_cgst: number; reverse_charge_sgst: number; reverse_charge_igst: number;
  itc_cgst: number; itc_sgst: number; itc_igst: number;
}

interface Gstr9Data {
  financial_year: string; gstin: string; legal_name: string; trade_name: string;
  taxable_outward: number; nil_rated_outward: number; zero_rated_outward: number;
  reverse_charge_inward: number; total_outward_taxable: number;
  total_outward_cgst: number; total_outward_sgst: number; total_outward_igst: number;
  itc_from_purchases_cgst: number; itc_from_purchases_sgst: number; itc_from_purchases_igst: number;
  itc_from_reverse_charge_cgst: number; itc_from_reverse_charge_sgst: number; itc_from_reverse_charge_igst: number;
  total_itc_cgst: number; total_itc_sgst: number; total_itc_igst: number;
  net_cgst_payable: number; net_sgst_payable: number; net_igst_payable: number;
  total_tax_payable: number;
}

interface Gstr9cLine {
  label: string; book_value: number; return_value: number; difference: number;
}

interface Gstr9cData {
  financial_year: string; gstin: string; legal_name: string; trade_name: string;
  gstr9_generated: boolean; gstr9_return_id: string | null;
  table4: Gstr9cLine[]; table6: Gstr9cLine[]; table8: Gstr9cLine[];
  total_difference: number; has_discrepancy: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERIODS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(); d.setMonth(d.getMonth() - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});
const FY_PERIODS = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const start = now.getMonth() >= 3 ? y - 4 : y - 5;
  return Array.from({ length: 5 }, (_, i) => {
    const s = start + i;
    return `${s}-${String(s + 1).slice(2)}`;
  });
})();
const QUARTERLY_PERIODS = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const periods: string[] = [];
  for (let yr = y; yr >= y - 1; yr--) {
    periods.push(`${yr}-04`, `${yr}-07`, `${yr}-10`);
    periods.push(`${yr + 1}-01`);
  }
  return periods.filter((p) => {
    const [py, pm] = p.split("-").map(Number);
    return py < y || (py === y && pm <= now.getMonth() + 1);
  }).slice(0, 8);
})();

export default function CompliancePage() {
  const [returns, setReturns] = useState<GstReturn[]>([]);
  const [registrations, setRegistrations] = useState<GstRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  // form
  const [retType, setRetType] = useState("gstr3b");
  const [period, setPeriod] = useState(PERIODS[0]);
  const [gstinId, setGstinId] = useState("");

  // detail view
  const [detail, setDetail] = useState<GstReturn | null>(null);
  const [detailData, setDetailData] = useState<Gstr1Data | Gstr3bData | Gstr9Data | Gstr9cData | null>(null);
  const [detailTab, setDetailTab] = useState<"b2b" | "b2cs" | "hsn">("b2b");

  const refresh = () => {
    setLoading(true);
    Promise.all([
      api.get<GstReturn[]>("/gst/returns"),
      api.get<GstRegistration[]>("/gst/registrations"),
    ]).then(([r, reg]) => { setReturns(r); setRegistrations(reg); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post<GstReturn>("/gst/returns/generate", {
        return_type: retType, period, gstin_id: gstinId || null,
      });
      setShowForm(false);
      refresh();
      viewDetail(res);
    } catch (err: any) {
      setError(err?.detail || "Failed to generate return");
    }
  };

  const viewDetail = async (ret: GstReturn) => {
    setDetail(ret);
    try {
      const data = await api.get<{ data_json: Record<string, any> } & GstReturn>(`/gst/returns/${ret.id}`);
      setDetailData(data.data_json as any);
      setDetailTab("b2b");
    } catch { setDetailData(null); }
  };

  const handleSubmitReturn = async (retId: string) => {
    if (!confirm("Mark this return as submitted?")) return;
    try {
      await api.patch(`/gst/returns/${retId}/submit`);
      refresh();
      if (detail?.id === retId) setDetail({ ...detail, status: "submitted" });
    } catch (err: any) {
      setError(err?.detail || "Failed to submit return");
    }
  };

  const returnTypeOptions = [
    { value: "gstr3b", label: "GSTR-3B (Monthly)" },
    { value: "gstr1", label: "GSTR-1 (Monthly)" },
    { value: "gstr4", label: "GSTR-4 (Quarterly)" },
    { value: "gstr9", label: "GSTR-9 (Annual)" },
    { value: "gstr9c", label: "GSTR-9C (Reconciliation)" },
  ];

  const isGstr9 = retType === "gstr9" || retType === "gstr9c";
  const isGstr4 = retType === "gstr4";
  const periodOptions = (isGstr9 ? FY_PERIODS : isGstr4 ? QUARTERLY_PERIODS : PERIODS).map((p) => ({ value: p, label: p }));

  const gstinOptions = [
    { value: "", label: "Primary GSTIN" },
    ...registrations.map((r) => ({ value: r.id, label: `${r.gstin} — ${r.legal_name}` })),
  ];

  if (detail && detailData) {
    const data = detailData as any;
    return (
      <div>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
          <div>
            <button onClick={() => { setDetail(null); setDetailData(null); }} className="text-sm text-brand-600 dark:text-violet-400 hover:underline">← Back to returns</button>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">
              {detail.return_type.toUpperCase()} — {detail.period}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              detail.status === "submitted" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
            }`}>{detail.status}</span>
            {detail.status === "draft" && (
              <button onClick={() => handleSubmitReturn(detail.id)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                Submit Return
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500 dark:text-[#94a3b8]">GSTIN: {detail.gstin || "—"}</p>

        {detail.return_type === "gstr1" && (
          <div>
            <div className="mt-4 flex gap-1 border-b border-slate-200 dark:border-[#1e1e28]">
              {(["b2b", "b2cs", "hsn"] as const).map((t) => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                    detailTab === t ? "border-brand-600 dark:border-violet-500/50 text-brand-700 dark:text-violet-400" : "border-transparent text-slate-500 dark:text-[#94a3b8] hover:text-slate-700 dark:hover:text-[#f1f5f9]"
                  }`}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {detailTab === "b2b" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">GSTIN</th><th className="pb-1">Invoice</th><th className="pb-1">Date</th>
                      <th className="pb-1 text-right">Value</th><th className="pb-1 text-right">Taxable</th>
                      <th className="pb-1 text-right">CGST</th><th className="pb-1 text-right">SGST</th><th className="pb-1 text-right">IGST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.b2b?.map((inv: B2BInvoice, i: number) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                        <td className="py-1">{inv.gstin}</td><td className="py-1">{inv.invoice_number}</td>
                        <td className="py-1">{toDisplayDate(inv.invoice_date)}</td>
                        <td className="py-1 text-right">₹{fmt(inv.invoice_value)}</td>
                        <td className="py-1 text-right">₹{fmt(inv.taxable_value)}</td>
                        <td className="py-1 text-right">₹{fmt(inv.cgst)}</td>
                        <td className="py-1 text-right">₹{fmt(inv.sgst)}</td>
                        <td className="py-1 text-right">₹{fmt(inv.igst)}</td>
                      </tr>
                    ))}
                    {(!data.b2b || data.b2b.length === 0) && (
                      <tr><td colSpan={8} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No B2B invoices.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
              {detailTab === "b2cs" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">POS</th><th className="pb-1 text-right">Rate</th>
                      <th className="pb-1 text-right">Taxable</th><th className="pb-1 text-right">CGST</th>
                      <th className="pb-1 text-right">SGST</th><th className="pb-1 text-right">IGST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.b2cs?.map((inv: B2CSInvoice, i: number) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                        <td className="py-1">{inv.place_of_supply || "—"}</td>
                        <td className="py-1 text-right">{inv.rate}%</td>
                        <td className="py-1 text-right">₹{fmt(inv.taxable_value)}</td>
                        <td className="py-1 text-right">₹{fmt(inv.cgst)}</td>
                        <td className="py-1 text-right">₹{fmt(inv.sgst)}</td>
                        <td className="py-1 text-right">₹{fmt(inv.igst)}</td>
                      </tr>
                    ))}
                    {(!data.b2cs || data.b2cs.length === 0) && (
                      <tr><td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No B2CS invoices.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
              {detailTab === "hsn" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                      <th className="pb-1">HSN</th><th className="pb-1">Description</th>
                      <th className="pb-1 text-right">Taxable</th><th className="pb-1 text-right">CGST</th>
                      <th className="pb-1 text-right">SGST</th><th className="pb-1 text-right">IGST</th>
                      <th className="pb-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.hsn?.map((h: HsnSummary, i: number) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-[#1e1e28]/50">
                        <td className="py-1">{h.hsn_code}</td><td className="py-1">{h.description}</td>
                        <td className="py-1 text-right">₹{fmt(h.taxable_value)}</td>
                        <td className="py-1 text-right">₹{fmt(h.cgst)}</td>
                        <td className="py-1 text-right">₹{fmt(h.sgst)}</td>
                        <td className="py-1 text-right">₹{fmt(h.igst)}</td>
                        <td className="py-1 text-right">₹{fmt(h.total_value)}</td>
                      </tr>
                    ))}
                    {(!data.hsn || data.hsn.length === 0) && (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No HSN data.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-200 dark:border-[#1e1e28] pt-3">
              <div><span className="text-xs text-slate-500 dark:text-[#94a3b8]">B2B Taxable</span><p className="font-medium">₹{fmt(data.total_b2b_taxable)}</p></div>
              <div><span className="text-xs text-slate-500 dark:text-[#94a3b8]">B2CS Taxable</span><p className="font-medium">₹{fmt(data.total_b2cs_taxable)}</p></div>
              <div><span className="text-xs text-slate-500 dark:text-[#94a3b8]">Total Tax</span><p className="font-medium">₹{fmt(data.total_cgst + data.total_sgst + data.total_igst)}</p></div>
            </div>
          </div>
        )}

        {detail.return_type === "gstr3b" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">3.1 — Outward Supplies</h3>
              <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Taxable Value</span><p className="font-medium">₹{fmt(data.taxable_value)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">CGST</span><p className="font-medium">₹{fmt(data.cgst_payable)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">SGST</span><p className="font-medium">₹{fmt(data.sgst_payable)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">IGST</span><p className="font-medium">₹{fmt(data.igst_payable)}</p></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">3.1(c) — Reverse Charge</h3>
              <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Taxable Value</span><p className="font-medium">₹{fmt(data.reverse_charge_taxable)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">CGST</span><p className="font-medium">₹{fmt(data.reverse_charge_cgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">SGST</span><p className="font-medium">₹{fmt(data.reverse_charge_sgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">IGST</span><p className="font-medium">₹{fmt(data.reverse_charge_igst)}</p></div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">4 — Eligible ITC</h3>
              <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">CGST</span><p className="font-medium">₹{fmt(data.itc_cgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">SGST</span><p className="font-medium">₹{fmt(data.itc_sgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">IGST</span><p className="font-medium">₹{fmt(data.itc_igst)}</p></div>
              </div>
            </div>
          </div>
        )}

        {detail.return_type === "gstr9" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Table 4 — Outward Supplies</h3>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">4A — Taxable Outward</span><p className="font-medium">₹{fmt(data.taxable_outward)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">4G — Reverse Charge</span><p className="font-medium">₹{fmt(data.reverse_charge_inward)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Total Taxable</span><p className="font-medium">₹{fmt(data.total_outward_taxable)}</p></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm border-t border-slate-100 dark:border-[#1e1e28]/50 pt-3">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">CGST</span><p className="font-medium">₹{fmt(data.total_outward_cgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">SGST</span><p className="font-medium">₹{fmt(data.total_outward_sgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">IGST</span><p className="font-medium">₹{fmt(data.total_outward_igst)}</p></div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Table 6 — Input Tax Credit</h3>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">6A — From Purchases (CGST)</span><p className="font-medium">₹{fmt(data.itc_from_purchases_cgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">6A — From Purchases (SGST)</span><p className="font-medium">₹{fmt(data.itc_from_purchases_sgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">6A — From Purchases (IGST)</span><p className="font-medium">₹{fmt(data.itc_from_purchases_igst)}</p></div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">6C — Reverse Charge (CGST)</span><p className="font-medium">₹{fmt(data.itc_from_reverse_charge_cgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">6C — Reverse Charge (SGST)</span><p className="font-medium">₹{fmt(data.itc_from_reverse_charge_sgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">6C — Reverse Charge (IGST)</span><p className="font-medium">₹{fmt(data.itc_from_reverse_charge_igst)}</p></div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-4 text-sm border-t border-slate-100 dark:border-[#1e1e28]/50 pt-3">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Total ITC CGST</span><p className="font-medium">₹{fmt(data.total_itc_cgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Total ITC SGST</span><p className="font-medium">₹{fmt(data.total_itc_sgst)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Total ITC IGST</span><p className="font-medium">₹{fmt(data.total_itc_igst)}</p></div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Table 8 — Net Tax Payable</h3>
              <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Net CGST</span><p className="font-medium">₹{fmt(data.net_cgst_payable)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Net SGST</span><p className="font-medium">₹{fmt(data.net_sgst_payable)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Net IGST</span><p className="font-medium">₹{fmt(data.net_igst_payable)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Total Payable</span><p className="font-medium">₹{fmt(data.total_tax_payable)}</p></div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Summary</h3>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Legal Name</span><p className="font-medium">{data.legal_name || "—"}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Trade Name</span><p className="font-medium">{data.trade_name || "—"}</p></div>
              </div>
            </div>
          </div>
        )}

        {detail.return_type === "gstr9c" && data.gstr9_generated === false && (
          <div className="mt-6 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              GSTR-9 has not been generated for this financial year. Generate GSTR-9 first to enable reconciliation.
            </p>
          </div>
        )}

        {detail.return_type === "gstr9c" && data.gstr9_generated === true && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Table 4 — Outward Supplies Reconciliation</h3>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8] border-b border-slate-200 dark:border-[#1e1e28]">
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Books (₹)</th>
                    <th className="pb-2 text-right">Return (₹)</th>
                    <th className="pb-2 text-right">Difference (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table4?.map((line: Gstr9cLine, i: number) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-[#1e1e28]/50">
                      <td className="py-1.5 font-medium">{line.label}</td>
                      <td className="py-1.5 text-right">₹{fmt(line.book_value)}</td>
                      <td className="py-1.5 text-right">₹{fmt(line.return_value)}</td>
                      <td className={`py-1.5 text-right ${Math.abs(line.difference) > 0.01 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                        {line.difference >= 0 ? "+" : ""}{fmt(line.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Table 6 — Input Tax Credit Reconciliation</h3>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8] border-b border-slate-200 dark:border-[#1e1e28]">
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Books (₹)</th>
                    <th className="pb-2 text-right">Return (₹)</th>
                    <th className="pb-2 text-right">Difference (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table6?.map((line: Gstr9cLine, i: number) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-[#1e1e28]/50">
                      <td className="py-1.5 font-medium">{line.label}</td>
                      <td className="py-1.5 text-right">₹{fmt(line.book_value)}</td>
                      <td className="py-1.5 text-right">₹{fmt(line.return_value)}</td>
                      <td className={`py-1.5 text-right ${Math.abs(line.difference) > 0.01 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                        {line.difference >= 0 ? "+" : ""}{fmt(line.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Table 8 — Net Tax Payable Reconciliation</h3>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8] border-b border-slate-200 dark:border-[#1e1e28]">
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Books (₹)</th>
                    <th className="pb-2 text-right">Return (₹)</th>
                    <th className="pb-2 text-right">Difference (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table8?.map((line: Gstr9cLine, i: number) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-[#1e1e28]/50">
                      <td className="py-1.5 font-medium">{line.label}</td>
                      <td className="py-1.5 text-right">₹{fmt(line.book_value)}</td>
                      <td className="py-1.5 text-right">₹{fmt(line.return_value)}</td>
                      <td className={`py-1.5 text-right ${Math.abs(line.difference) > 0.01 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                        {line.difference >= 0 ? "+" : ""}{fmt(line.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Reconciliation Summary</h3>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 dark:text-[#94a3b8]">Total Difference</span>
                  <p className={`font-medium text-lg ${data.has_discrepancy ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    ₹{fmt(data.total_difference)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-[#94a3b8]">Status</span>
                  <p className={`font-medium ${data.has_discrepancy ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {data.has_discrepancy ? "⚠ Discrepancies Found" : "✓ Books Match Returns"}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Legal Name</span><p className="font-medium">{data.legal_name || "—"}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Trade Name</span><p className="font-medium">{data.trade_name || "—"}</p></div>
              </div>
            </div>
          </div>
        )}

        {detail.return_type === "gstr4" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Table 3 — Outward Supplies (Turnover)</h3>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Outward Turnover</span><p className="font-medium">₹{fmt(data.outward_turnover)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Composition Tax Rate</span><p className="font-medium">{data.composition_tax_rate}%</p></div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Table 5 — Tax Payable</h3>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Composition Tax Payable</span><p className="font-medium">₹{fmt(data.composition_tax_payable)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Interest</span><p className="font-medium">₹{fmt(data.interest)}</p></div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-4 text-sm border-t border-slate-100 dark:border-[#1e1e28]/50 pt-3">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Late Fee</span><p className="font-medium">₹{fmt(data.late_fee)}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Total Payable</span><p className="font-medium text-lg">₹{fmt(data.total_payable)}</p></div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Summary</h3>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Legal Name</span><p className="font-medium">{data.legal_name || "—"}</p></div>
                <div><span className="text-slate-500 dark:text-[#94a3b8]">Trade Name</span><p className="font-medium">{data.trade_name || "—"}</p></div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1e1e28] pb-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">GST Compliance</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          {showForm ? "Cancel" : "+ Generate Return"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleGenerate} className="mt-4 rounded-lg border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Select
              value={retType}
              onChange={(v) => { setRetType(v); setPeriod(v === "gstr9" ? FY_PERIODS[2] : v === "gstr4" ? QUARTERLY_PERIODS[0] : PERIODS[0]); }}
              options={returnTypeOptions}
              label="Return Type"
              className="w-full"
            />
            <Select
              value={period}
              onChange={setPeriod}
              options={periodOptions}
              label="Period"
              className="w-full"
            />
            <Select
              value={gstinId}
              onChange={setGstinId}
              options={gstinOptions}
              label="GSTIN"
              placeholder="Primary GSTIN"
              className="w-full"
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
          <button type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Generate
          </button>
        </form>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-[#94a3b8]">Loading…</p>
      ) : (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1e1e28] text-left text-xs font-medium uppercase text-slate-500 dark:text-[#94a3b8]">
                <th className="pb-2">Type</th><th className="pb-2">Period</th><th className="pb-2">GSTIN</th>
                <th className="pb-2">Status</th><th className="pb-2">Filed</th><th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-[#1e1e28]/50 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252530]" onClick={() => viewDetail(r)}>
                  <td className="py-2 font-medium capitalize">{r.return_type}</td>
                  <td className="py-2">{r.period}</td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{r.gstin || "—"}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      r.status === "submitted" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}>{r.status}</span>
                  </td>
                  <td className="py-2 text-slate-600 dark:text-[#94a3b8]">{toDisplayDate(r.filed_date)}</td>
                  <td className="py-2 text-right">
                    {r.status === "draft" && (
                      <button onClick={(e) => { e.stopPropagation(); handleSubmitReturn(r.id); }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">Submit</button>
                    )}
                  </td>
                </tr>
              ))}
              {returns.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#64748b]">No returns generated yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
