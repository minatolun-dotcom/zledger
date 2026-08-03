import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import EInvoicePage from "./EInvoicePage";
import EwayBillPage from "./EwayBillPage";
import HsnSacPage from "./HsnSacPage";
import GstRegistrationsPage from "./GstRegistrationsPage";
import Tabs from "../components/Tabs";
import TabContent from "../components/TabContent";
import { useToastStore } from "../store/toast";

type GstTab = "einvoice" | "eway-bill" | "hsn-sac" | "registrations" | "gstr1" | "gstr3b" | "gstr2b" | "itc-reversal";

const tabs: { key: GstTab; label: string }[] = [
  { key: "einvoice", label: "E-Invoice" },
  { key: "eway-bill", label: "E-Way Bill" },
  { key: "hsn-sac", label: "HSN / SAC" },
  { key: "registrations", label: "Registrations" },
  { key: "gstr1", label: "GSTR-1" },
  { key: "gstr3b", label: "GSTR-3B" },
  { key: "gstr2b", label: "GSTR-2B" },
  { key: "itc-reversal", label: "ITC Rev." },
];



export default function GstPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Initialize from the URL synchronously so ?tab=hsn-sac never mounts the
  // default E-Invoice tab (whose /einvoice call 400s when EINVOICE_ENABLED=false).
  const [tab, setTab] = useState<GstTab>(() => {
    const paramTab = searchParams.get("tab") as GstTab | null;
    return paramTab && tabs.some((t) => t.key === paramTab) ? paramTab : "einvoice";
  });

  // Auto-open tab from command palette (?tab=einvoice|eway-bill|hsn-sac|registrations)
  useEffect(() => {
    const paramTab = searchParams.get("tab") as GstTab | null;
    if (!paramTab) return;
    setSearchParams({}, { replace: true });
    setTab(paramTab);
  }, [searchParams]);

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">GST</h1>
      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(k) => setTab(k as GstTab)}
        className="mt-4 mb-6 overflow-x-auto"
      />

      {/* Tab content */}
      <TabContent activeKey={tab}>
        {tab === "einvoice" && <EInvoicePage />}
        {tab === "eway-bill" && <EwayBillPage />}
        {tab === "hsn-sac" && <HsnSacPage />}
        {tab === "registrations" && <GstRegistrationsPage />}
        {tab === "gstr1" && <Gstr1View />}
        {tab === "gstr3b" && <Gstr3bView />}
        {tab === "gstr2b" && <Gstr2bView />}
        {tab === "itc-reversal" && <ItcReversalView />}
      </TabContent>
    </div>
  );
}

/* ── GSTR-1 ──────────────────────────────────────────────────── */
function Gstr1View() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState("2026-07");
  const toast = useToastStore();

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.post<any>("/gst/returns/generate", { return_type: "gstr1", period });
      setData(res);
    } catch (e: any) { toast.error(e?.message || "Failed to load GSTR-1"); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm" />
        <button onClick={fetch} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">Generate</button>
      </div>
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {data && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">
                <th className="px-3 py-2.5 min-w-[120px]">Invoice</th><th className="px-3 py-2.5 w-[100px]">Date</th><th className="px-3 py-2.5 min-w-[140px]">Customer</th>
                <th className="px-3 py-2.5 w-[120px] text-right tabular-nums">Taxable</th><th className="px-3 py-2.5 w-[120px] text-right tabular-nums">Tax</th><th className="px-3 py-2.5 w-[110px]">Type</th>
              </tr>
            </thead>
            <tbody>
              {(data.b2b || []).map((inv: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]/50">
                  <td className="py-2 truncate max-w-[120px]" title={inv.invoice_number}>{inv.invoice_number}</td>
                  <td className="py-2 whitespace-nowrap">{inv.invoice_date}</td>
                  <td className="py-2 truncate max-w-[140px]" title={inv.customer_name}>{inv.customer_name}</td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums font-mono">₹{Number(inv.taxable_value).toLocaleString("en-IN")}</td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums font-mono">₹{Number(inv.tax_amount).toLocaleString("en-IN")}</td>
                  <td className="py-2 whitespace-nowrap">{inv.is_inter_state ? "IGST" : "CGST+SGST"}</td>
                </tr>
              ))}
              {(data.b2b || []).length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">No B2B invoices found for this period.</td></tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-end gap-6 px-4 py-2 text-sm font-semibold">
            <span>Total: ₹{Number(data.total_invoice_value || 0).toLocaleString("en-IN")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── GSTR-3B ──────────────────────────────────────────────────── */
function Gstr3bView() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState("2026-07");
  const toast = useToastStore();

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.post<any>("/gst/returns/generate", { return_type: "gstr3b", period });
      setData(res);
    } catch (e: any) { toast.error(e?.message || "Failed to load GSTR-3B"); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm" />
        <button onClick={fetch} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">Generate</button>
      </div>
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#cbd5e1]">Total Tax Payable</div>
            <div className="mt-1 text-2xl font-bold">₹{Number(data.total_tax_payable || 0).toLocaleString("en-IN")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#cbd5e1]">IGST</div>
            <div className="mt-1 text-2xl font-bold">₹{Number(data.igst || 0).toLocaleString("en-IN")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4">
            <div className="text-sm text-slate-500 dark:text-[#cbd5e1]">CGST+SGST</div>
            <div className="mt-1 text-2xl font-bold">₹{Number((data.cgst || 0) + (data.sgst || 0)).toLocaleString("en-IN")}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── GSTR-2B ──────────────────────────────────────────────────── */
function Gstr2bView() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState("2026-07");
  const toast = useToastStore();

  const reconcile = async () => {
    setLoading(true);
    try {
      const res = await api.post<any>("/gst/gstr2b/reconcile", { period, financial_year_id: "" });
      setData(res);
    } catch (e: any) { toast.error(e?.message || "Failed to reconcile"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-[#282832] bg-white dark:bg-[#0f0f16] px-3 py-1.5 text-sm" />
        <button onClick={reconcile} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">Reconcile</button>
      </div>
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {data && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 dark:bg-[#1a1a24] text-left text-xs font-medium text-slate-500 dark:text-[#cbd5e1]">
                <th className="px-3 py-2.5 min-w-[150px]">Party</th><th className="px-3 py-2.5 min-w-[120px]">Invoice</th>
                <th className="px-3 py-2.5 w-[130px] text-right tabular-nums">Amount</th><th className="px-3 py-2.5 w-[100px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.matched || []).map((m: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]/50">
                  <td className="py-2 truncate max-w-[150px]" title={m.supplier_name}>{m.supplier_name}</td>
                  <td className="py-2 truncate max-w-[120px]" title={m.invoice_number}>{m.invoice_number}</td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums font-mono">₹{Number(m.amount).toLocaleString("en-IN")}</td>
                  <td className="py-2 whitespace-nowrap"><span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">Matched</span></td>
                </tr>
              ))}
              {(data.mismatched || []).map((m: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]/50">
                  <td className="py-2 truncate max-w-[150px]" title={m.supplier_name}>{m.supplier_name}</td>
                  <td className="py-2 truncate max-w-[120px]" title={m.invoice_number}>{m.invoice_number}</td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums font-mono">₹{Number(m.amount).toLocaleString("en-IN")}</td>
                  <td className="py-2 whitespace-nowrap"><span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">Mismatch</span></td>
                </tr>
              ))}
              {(!data.matched || !data.mismatched || (data.matched.length === 0 && data.mismatched.length === 0)) && (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400">No reconciliation data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── ITC Reversal ─────────────────────────────────────────────── */
function ItcReversalView() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [fyId, setFyId] = useState("");
  const toast = useToastStore();

  useEffect(() => {
    api.get<any>("/coa/financial-years").then((fys: unknown) => {
      const arr = Array.isArray(fys) ? fys : (fys as any)?.items || [];
      if (arr.length) setFyId(arr[arr.length - 1].id);
    }).catch(() => {});
  }, []);

  const calc = async () => {
    if (!fyId) return;
    setLoading(true);
    try {
      const res = await api.post<any>("/gst/itc-reversal", { financial_year_id: fyId });
      setData(res);
    } catch (e: any) { toast.error(e?.message || "Failed to calculate"); }
    finally { setLoading(false); }
  };

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <button onClick={calc} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700" disabled={!fyId}>
        Calculate ITC Reversal
      </button>
      {loading && <p className="text-sm text-slate-500">Calculating…</p>}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4">
            <div className="text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">Rule 42 (Exempt Supply)</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span>CGST:</span><span>₹{fmt(data.rule42_itc_cgst || 0)}</span></div>
              <div className="flex justify-between"><span>SGST:</span><span>₹{fmt(data.rule42_itc_sgst || 0)}</span></div>
              <div className="flex justify-between"><span>IGST:</span><span>₹{fmt(data.rule42_itc_igst || 0)}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4">
            <div className="text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">Rule 43 (Capital Goods)</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span>CGST:</span><span>₹{fmt(data.rule43_itc_cgst || 0)}</span></div>
              <div className="flex justify-between"><span>SGST:</span><span>₹{fmt(data.rule43_itc_sgst || 0)}</span></div>
              <div className="flex justify-between"><span>IGST:</span><span>₹{fmt(data.rule43_itc_igst || 0)}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] p-4">
            <div className="text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">Total Reversal</div>
            <div className="mt-2 text-3xl font-bold text-amber-600">₹{fmt((data.rule42_itc_cgst||0)+(data.rule42_itc_sgst||0)+(data.rule42_itc_igst||0)+(data.rule43_itc_cgst||0)+(data.rule43_itc_sgst||0)+(data.rule43_itc_igst||0))}</div>
          </div>
        </div>
      )}
    </div>
  );
}
