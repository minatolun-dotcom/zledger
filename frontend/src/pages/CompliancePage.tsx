import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import Select from "../components/Select";
import Tabs from "../components/Tabs";
import { useFyStore } from "../store/fy";
import { downloadFile } from "./reports/shared";
import { useToastStore } from "../store/toast";

type Tab = "schedule-iii" | "indas-pl" | "income-tax" | "icai-nce" | "gst-status";

interface FinancialYear { id: string; name: string; }
interface ScheduleIII {
  financial_year: string;
  part_i: { part: string; title: string; total: number | string; headings: any[] };
  part_ii: { part: string; title: string; total: number | string; headings: any[] };
  total_equity_liabilities: number | string;
  total_assets: number | string;
  balanced: boolean;
}
interface IndasPl {
  financial_year: string;
  revenue_from_operations: number | string;
  other_income: number | string;
  total_income: number | string;
  expenses: Record<string, number | string>;
  total_expenses: number | string;
  net_profit: number | string;
  is_profit: boolean;
}
interface IncomeTax {
  regime: string;
  financial_year: string;
  gross_receipts: string;
  business_profit: string;
  presumptive_section: string | null;
  taxable_income: string;
  tax: string;
  surcharge: string;
  cess: string;
  total_tax: string;
  rebate_87a: string;
  notes: string[];
}
interface IcaiNce {
  balance_sheet: ScheduleIII;
  profit_and_loss: IndasPl;
  notes: Record<string, any>;
}
interface GstStatus {
  financial_year: string;
  returns: Record<string, { generated: boolean; summary?: any; error?: string }>;
}

function money(v: number | string | undefined): string {
  if (v === undefined || v === null || v === "") return "0.00";
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  if (isNaN(n)) return String(v);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CompliancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeFyId, setActiveFy } = useFyStore();
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [tab, setTab] = useState<Tab>((searchParams.get("tab") as Tab) || "schedule-iii");
  const [loading, setLoading] = useState(false);
  const [bs, setBs] = useState<ScheduleIII | null>(null);
  const [pl, setPl] = useState<IndasPl | null>(null);
  const [it, setIt] = useState<IncomeTax | null>(null);
  const [nce, setNce] = useState<IcaiNce | null>(null);
  const [gst, setGst] = useState<GstStatus | null>(null);
  const [regime, setRegime] = useState<"old" | "new">("new");
  const [electing, setElecting] = useState(false);
  const toast = useToastStore();

  useEffect(() => {
    const param = searchParams.get("tab") as Tab | null;
    if (param) {
      setTab(param);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    api.get<FinancialYear[]>("/coa/financial-years")
      .then((data) => {
        setFys(data);
        if (!activeFyId && data.length) setActiveFy(data[data.length - 1].id);
      })
      .catch(() => {});
  }, [activeFyId, setActiveFy]);

  const load = async () => {
    if (!activeFyId) return;
    setLoading(true);
    try {
      if (tab === "schedule-iii") {
        setBs(await api.get<ScheduleIII>(`/compliance/schedule-iii/balance-sheet?financial_year_id=${activeFyId}`));
      } else if (tab === "indas-pl") {
        setPl(await api.get<IndasPl>(`/compliance/indas/profit-loss?financial_year_id=${activeFyId}`));
      } else if (tab === "income-tax") {
        setIt(await api.get<IncomeTax>(`/compliance/income-tax/compute?financial_year_id=${activeFyId}&regime=${regime}`));
      } else if (tab === "icai-nce") {
        setNce(await api.get<IcaiNce>(`/compliance/icai-nce?financial_year_id=${activeFyId}`));
      } else if (tab === "gst-status") {
        setGst(await api.get<GstStatus>(`/compliance/gst-status?financial_year_id=${activeFyId}`));
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, activeFyId, regime]);

  const download = (suffix: string, filename: string) => {
    if (!activeFyId) return;
    const q = tab === "income-tax" ? `?financial_year_id=${activeFyId}&regime=${regime}` : `?financial_year_id=${activeFyId}`;
    downloadFile(`/compliance${suffix}${q}`, filename).catch((e) => toast.error(e?.message || "Download failed"));
  };

  const electRegime = async () => {
    if (!activeFyId) return;
    setElecting(true);
    try {
      const fyName = fys.find((f) => f.id === activeFyId)?.name || "";
      await api.post("/compliance/income-tax/regime", { regime, financial_year: fyName });
      toast.success(`Income-tax regime set to ${regime.toUpperCase()} for ${fyName}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to elect regime");
    } finally {
      setElecting(false);
    }
  };

  const fyOptions = fys.map((f) => ({ value: f.id, label: f.name }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Statutory Compliance</h1>
        <div className="w-56">
          <Select
            value={activeFyId || ""}
            onChange={(id) => id && setActiveFy(id)}
            options={fyOptions}
            placeholder="Financial Year"
          />
        </div>
      </div>

      <Tabs
        tabs={[
          { key: "schedule-iii", label: "Schedule III BS" },
          { key: "indas-pl", label: "Ind-AS P&L" },
          { key: "income-tax", label: "Income Tax" },
          { key: "icai-nce", label: "ICAI NCE" },
          { key: "gst-status", label: "GST Status" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as Tab)}
        className="mt-4 mb-6 overflow-x-auto"
      />

      {!activeFyId && <p className="text-sm text-slate-500 dark:text-[#64748b]">Select a financial year to view compliance statements.</p>}
      {loading && <p className="text-sm text-slate-500 dark:text-[#64748b]">Loading…</p>}

      {!loading && activeFyId && tab === "schedule-iii" && bs && (
        <ScheduleIIIView data={bs}
          onPdf={() => download("/schedule-iii/balance-sheet/pdf", `schedule-iii-${bs.financial_year}.pdf`)}
          onXlsx={() => download("/schedule-iii/balance-sheet/xlsx", `schedule-iii-${bs.financial_year}.xlsx`)} />
      )}

      {!loading && activeFyId && tab === "indas-pl" && pl && (
        <IndasPlView data={pl} />
      )}

      {!loading && activeFyId && tab === "income-tax" && (
        <IncomeTaxView
          data={it}
          regime={regime}
          onRegime={(r) => setRegime(r)}
          onElect={electRegime}
          electing={electing}
          onPdf={() => download("/income-tax/pdf", `income-tax-${regime}-${activeFyId}.pdf`)}
          onXlsx={() => download("/income-tax/xlsx", `income-tax-${regime}-${activeFyId}.xlsx`)}
        />
      )}

      {!loading && activeFyId && tab === "icai-nce" && nce && (
        <IcaiNceView data={nce}
          onPdf={() => download("/icai-nce/pdf", `icai-nce-${nce.balance_sheet.financial_year}.pdf`)}
          onXlsx={() => download("/icai-nce/xlsx", `icai-nce-${nce.balance_sheet.financial_year}.xlsx`)} />
      )}

      {!loading && activeFyId && tab === "gst-status" && gst && (
        <GstStatusView data={gst} />
      )}
    </div>
  );
}

/* ── Schedule III Balance Sheet ─────────────────────────────────────── */
function ScheduleIIIView({ data, onPdf, onXlsx }: { data: ScheduleIII; onPdf: () => void; onXlsx: () => void }) {
  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <button onClick={onPdf} className="rounded-md bg-[#6d4aff] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5b3de0]">Download PDF</button>
        <button onClick={onXlsx} className="rounded-md border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24]">Download XLSX</button>
      </div>
      <PartTable title={data.part_i.title} headings={data.part_i.headings} total={data.part_i.total} />
      <PartTable title={data.part_ii.title} headings={data.part_ii.headings} total={data.part_ii.total} />
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SummaryCard label="Total Equity & Liabilities" value={money(data.total_equity_liabilities)} />
        <SummaryCard label="Total Assets" value={money(data.total_assets)} />
        <SummaryCard label="Balanced" value={data.balanced ? "Yes ✓" : "No ✗"} danger={!data.balanced} />
      </div>
    </div>
  );
}

function PartTable({ title, headings, total }: { title: string; headings: any[]; total: number | string }) {
  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 dark:border-[#282832]">
      <div className="bg-slate-50 dark:bg-[#16161f] px-4 py-2 text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">{title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-[#282832] text-left text-xs uppercase text-slate-500 dark:text-[#64748b]">
            <th className="px-4 py-2">Heading</th>
            <th className="px-4 py-2 text-right">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {headings.map((h, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-[#1a1a24]">
              <td className="px-4 py-2 text-slate-700 dark:text-[#cbd5e1]">
                <span className="font-medium">{h.heading}</span>
                {h.sub_heading && <span className="ml-2 text-xs text-slate-400 dark:text-[#64748b]">{h.sub_heading}</span>}
                {h.lines?.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-3 text-xs text-slate-500 dark:text-[#94a3b8]">
                    {h.lines.map((l: any, j: number) => (
                      <li key={j} className="flex justify-between gap-4">
                        <span>{l.ledger_name}</span>
                        <span>{money(l.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-[#cbd5e1]">{money(h.total)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 dark:bg-[#16161f] font-semibold">
            <td className="px-4 py-2 text-slate-700 dark:text-[#f1f5f9]">TOTAL {title.toUpperCase()}</td>
            <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-[#f1f5f9]">{money(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── Ind-AS Profit & Loss ───────────────────────────────────────────── */
function IndasPlView({ data }: { data: IndasPl }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-[#282832]">
        <div className="bg-slate-50 dark:bg-[#16161f] px-4 py-2 text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">Profit & Loss — {data.financial_year}</div>
        <table className="w-full text-sm">
          <tbody>
            <Row label="Revenue from Operations" value={money(data.revenue_from_operations)} />
            <Row label="Other Income" value={money(data.other_income)} />
            <Row label="Total Income" value={money(data.total_income)} bold />
            <Row label="Total Expenses" value={money(data.total_expenses)} />
            <Row label="Net Profit" value={money(data.net_profit)} bold />
          </tbody>
        </table>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-[#282832]">
        <div className="bg-slate-50 dark:bg-[#16161f] px-4 py-2 text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">Expenses by Group</div>
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(data.expenses).map(([k, v]) => (
              <Row key={k} label={k} value={money(v)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Income Tax ─────────────────────────────────────────────────────── */
function IncomeTaxView({ data, regime, onRegime, onElect, electing, onPdf, onXlsx }: {
  data: IncomeTax | null; regime: "old" | "new"; onRegime: (r: "old" | "new") => void;
  onElect: () => void; electing: boolean; onPdf: () => void; onXlsx: () => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-slate-300 dark:border-[#282832] p-0.5">
          {(["old", "new"] as const).map((r) => (
            <button key={r} onClick={() => onRegime(r)}
              className={`rounded px-3 py-1 text-sm font-medium ${regime === r ? "bg-[#6d4aff] text-white" : "text-slate-600 dark:text-[#94a3b8]"}`}>
              {r === "old" ? "Old Regime" : "New Regime (115BAC)"}
            </button>
          ))}
        </div>
        <button onClick={onElect} disabled={electing}
          className="rounded-md border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24] disabled:opacity-50">
          {electing ? "Saving…" : "Elect this regime"}
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={onPdf} className="rounded-md bg-[#6d4aff] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5b3de0]">Download PDF</button>
          <button onClick={onXlsx} className="rounded-md border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24]">Download XLSX</button>
        </div>
      </div>
      {data ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-[#282832]">
          <table className="w-full text-sm">
            <tbody>
              <Row label="Financial Year" value={data.financial_year} />
              <Row label="Regime" value={data.regime.toUpperCase()} />
              <Row label="Gross Receipts / Turnover" value={money(data.gross_receipts)} />
              <Row label="Business Profit" value={money(data.business_profit)} />
              {data.presumptive_section && <Row label={`Presumptive (${data.presumptive_section})`} value="Applied" />}
              <Row label="Taxable Income" value={money(data.taxable_income)} bold />
              <Row label="Income Tax" value={money(data.tax)} />
              {data.rebate_87a && parseFloat(data.rebate_87a) > 0 && <Row label="Rebate u/s 87A" value={`-${money(data.rebate_87a)}`} />}
              <Row label="Surcharge" value={money(data.surcharge)} />
              <Row label="Health & Education Cess (4%)" value={money(data.cess)} />
              <Row label="Total Tax Payable" value={money(data.total_tax)} bold />
            </tbody>
          </table>
          {data.notes.length > 0 && (
            <ul className="space-y-1 bg-slate-50 dark:bg-[#16161f] px-4 py-3 text-xs text-slate-500 dark:text-[#94a3b8]">
              {data.notes.map((n, i) => <li key={i}>• {n}</li>)}
            </ul>
          )}
        </div>
      ) : <p className="text-sm text-slate-500 dark:text-[#64748b]">No taxable income computed.</p>}
    </div>
  );
}

/* ── ICAI NCE ──────────────────────────────────────────────────────── */
function IcaiNceView({ data, onPdf, onXlsx }: { data: IcaiNce; onPdf: () => void; onXlsx: () => void }) {
  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <button onClick={onPdf} className="rounded-md bg-[#6d4aff] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5b3de0]">Download PDF</button>
        <button onClick={onXlsx} className="rounded-md border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#1a1a24]">Download XLSX</button>
      </div>
      <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 dark:border-[#282832]">
        <div className="bg-slate-50 dark:bg-[#16161f] px-4 py-2 text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">Balance Sheet (ICAI NCE)</div>
        <table className="w-full text-sm">
          <tbody>
            <Row label="Total Equity & Liabilities" value={money(data.balance_sheet.total_equity_liabilities)} />
            <Row label="Total Assets" value={money(data.balance_sheet.total_assets)} />
            <Row label="Balanced" value={data.balance_sheet.balanced ? "Yes ✓" : "No ✗"} />
          </tbody>
        </table>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-[#282832]">
        <div className="bg-slate-50 dark:bg-[#16161f] px-4 py-2 text-sm font-semibold text-slate-700 dark:text-[#f1f5f9]">Statement of Profit & Loss</div>
        <table className="w-full text-sm">
          <tbody>
            <Row label="Revenue from Operations" value={money(data.profit_and_loss.revenue_from_operations)} />
            <Row label="Other Income" value={money(data.profit_and_loss.other_income)} />
            <Row label="Total Income" value={money(data.profit_and_loss.total_income)} bold />
            <Row label="Total Expenses" value={money(data.profit_and_loss.total_expenses)} />
            <Row label="Net Profit" value={money(data.profit_and_loss.net_profit)} bold />
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── GST Status ────────────────────────────────────────────────────── */
function GstStatusView({ data }: { data: GstStatus }) {
  const labels: Record<string, string> = { gstr1: "GSTR-1 (Outward)", gstr3b: "GSTR-3B (Monthly)", gstr9: "GSTR-9 (Annual)" };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-[#64748b]">GST return filing status for FY <span className="font-medium text-slate-700 dark:text-[#cbd5e1]">{data.financial_year}</span></p>
      {Object.entries(data.returns).map(([rtype, info]) => (
        <div key={rtype} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-[#282832] px-4 py-3">
          <span className="text-sm font-medium text-slate-700 dark:text-[#cbd5e1]">{labels[rtype] || rtype.toUpperCase()}</span>
          {info.generated ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">Generated ✓</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Not generated</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Shared small components ───────────────────────────────────────── */
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className="border-b border-slate-100 dark:border-[#1a1a24]">
      <td className="px-4 py-2 text-slate-600 dark:text-[#94a3b8]">{label}</td>
      <td className={`px-4 py-2 text-right tabular-nums text-slate-700 dark:text-[#cbd5e1] ${bold ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}

function SummaryCard({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#282832] px-4 py-3">
      <div className="text-xs uppercase text-slate-500 dark:text-[#64748b]">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${danger ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-[#f1f5f9]"}`}>{value}</div>
    </div>
  );
}
