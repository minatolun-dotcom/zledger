import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

import { toDisplayDate } from "../utils/dateUtils";
import { useFyStore } from "../store/fy";
import Select from "../components/Select";
import Tabs from "../components/Tabs";
import TabContent from "../components/TabContent";
import PdfPreviewModal from "../components/PdfPreviewModal";
import { PAGE_TAB_DEFS, type PageTabDef } from "../config/pageTabs";
import NavIcon from "../components/NavIcon";
import { ReportsSkeleton } from "./skeletons";
import { useFinancialYears } from "../hooks/useMasterData";

import { Tab, TrialBalanceData, PnLData, BSData, CashFlowData, AgingData, OutstandingData, RegisterData, TdsTcsSummaryData, StockSummaryData, StockMovementData, StockAgeingData, LedgerTransactionData, VoucherDetail } from "./reports/shared";
import { downloadFile } from "./reports/shared";
import TrialBalanceReport from "./reports/TrialBalanceReport";
import PnlReport from "./reports/PnlReport";
import BalanceSheetReport from "./reports/BalanceSheetReport";
import CashFlowReport from "./reports/CashFlowReport";
import AgingReport from "./reports/AgingReport";
import OutstandingReport from "./reports/OutstandingReport";
import RegisterReport from "./reports/RegisterReport";
import TdsTcsReport from "./reports/TdsTcsReport";
import StockSummaryReport from "./reports/StockSummaryReport";
import StockMovementReport from "./reports/StockMovementReport";
import StockAgeingReport from "./reports/StockAgeingReport";
import LedgerDetailModal from "./reports/LedgerDetailModal";
import VoucherDetailModal from "./reports/VoucherDetailModal";

export default function ReportsPage() {
  const { data: fys = [] } = useFinancialYears();
  const { activeFyId: selectedFy, setActiveFy: setSelectedFy } = useFyStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("trial-balance");
  const [agingType, setAgingType] = useState<"receivable" | "payable">("receivable");
  const [regVoucherType, setRegVoucherType] = useState("sales");
  const [tdsTcsType, setTdsTcsType] = useState("tds");
  const [error, setError] = useState("");
  const [ledgerTx, setLedgerTx] = useState<LedgerTransactionData | null>(null);
  const [showLedgerDetail, setShowLedgerDetail] = useState(false);
  const [ledgerDetailLoading, setLedgerDetailLoading] = useState(false);
  const [voucherDetail, setVoucherDetail] = useState<VoucherDetail | null>(null);
  const [voucherStack, setVoucherStack] = useState<VoucherDetail[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  useEffect(() => {
    if (fys.length > 0 && (!selectedFy || !fys.some((f) => f.id === selectedFy))) {
      setSelectedFy(fys[fys.length - 1].id);
    }
  }, [fys, selectedFy, setSelectedFy]);

  // Auto-open tab from command palette (?tab=trial-balance|profit-and-loss|balance-sheet)
  useEffect(() => {
    const paramTab = searchParams.get("tab") as Tab | null;
    if (!paramTab) return;
    setSearchParams({}, { replace: true });
    setTab(paramTab);
  }, [searchParams]);

  // ── Per-tab React Query fetchers (each keyed on FY + sub-type, so switching
  //    back to a previously-viewed tab renders instantly from cache) ──
  const active = (t: Tab) => tab === t;

  const tbQuery = useQuery({
    queryKey: ["report", "trial-balance", selectedFy],
    enabled: !!selectedFy && active("trial-balance"),
    queryFn: () => api.get<TrialBalanceData>(`/reports/trial-balance?financial_year_id=${selectedFy}`),
  });
  const pnlQuery = useQuery({
    queryKey: ["report", "profit-and-loss", selectedFy],
    enabled: !!selectedFy && active("profit-and-loss"),
    queryFn: () => api.get<PnLData>(`/reports/profit-and-loss?financial_year_id=${selectedFy}`),
  });
  const bsQuery = useQuery({
    queryKey: ["report", "balance-sheet", selectedFy],
    enabled: !!selectedFy && active("balance-sheet"),
    queryFn: () => api.get<BSData>(`/reports/balance-sheet?financial_year_id=${selectedFy}`),
  });
  const cfQuery = useQuery({
    queryKey: ["report", "cash-flow", selectedFy],
    enabled: !!selectedFy && active("cash-flow"),
    queryFn: () => api.get<CashFlowData>(`/reports/cash-flow?financial_year_id=${selectedFy}`),
  });
  const agingQuery = useQuery({
    queryKey: ["report", "aging", selectedFy, agingType],
    enabled: !!selectedFy && active("aging"),
    queryFn: () => api.get<AgingData>(`/reports/aging?financial_year_id=${selectedFy}&type=${agingType}`),
  });
  const osQuery = useQuery({
    queryKey: ["report", "outstanding", selectedFy],
    enabled: !!selectedFy && active("outstanding"),
    queryFn: () => api.get<OutstandingData>(`/reports/outstanding?financial_year_id=${selectedFy}`),
  });
  const regQuery = useQuery({
    queryKey: ["report", "register", selectedFy, regVoucherType],
    enabled: !!selectedFy && active("register"),
    queryFn: () => api.get<RegisterData>(`/reports/register?financial_year_id=${selectedFy}&voucher_type=${regVoucherType}`),
  });
  const tdsQuery = useQuery({
    queryKey: ["report", "tds-tcs", selectedFy, tdsTcsType],
    enabled: !!selectedFy && active("tds-tcs"),
    queryFn: () => api.get<TdsTcsSummaryData>(`/reports/tds-tcs-summary?financial_year_id=${selectedFy}&tds_tcs_type=${tdsTcsType}`),
  });
  const stockSummaryQuery = useQuery({
    queryKey: ["report", "stock-summary"],
    enabled: active("stock-summary"),
    queryFn: () => api.get<StockSummaryData>("/reports/stock-summary"),
  });
  const stockMovementQuery = useQuery({
    queryKey: ["report", "stock-movement"],
    enabled: active("stock-movement"),
    queryFn: () => api.get<StockMovementData>("/reports/stock-movement"),
  });
  const stockAgeingQuery = useQuery({
    queryKey: ["report", "stock-ageing"],
    enabled: active("stock-ageing"),
    queryFn: () => api.get<StockAgeingData>("/reports/stock-ageing"),
  });

  // Sub-type changes just update state; the query keys above derive from the
  // state, so the active tab's query automatically refetches with the new value.
  const fetchReport = useCallback((_tabName: Tab, _fyId: string, subType?: string, subVt?: string) => {
    if (_tabName === "aging" && subType) setAgingType(subType as "receivable" | "payable");
    else if (_tabName === "register" && subVt) setRegVoucherType(subVt);
    else if (_tabName === "tds-tcs" && subType) setTdsTcsType(subType);
  }, []);

  const queries: Record<Tab, { data: any; isLoading: boolean; isError: boolean; error: unknown }> = {
    "trial-balance": tbQuery,
    "profit-and-loss": pnlQuery,
    "balance-sheet": bsQuery,
    "cash-flow": cfQuery,
    aging: agingQuery,
    outstanding: osQuery,
    register: regQuery,
    "tds-tcs": tdsQuery,
    "stock-summary": stockSummaryQuery,
    "stock-movement": stockMovementQuery,
    "stock-ageing": stockAgeingQuery,
  };
  const activeQuery = queries[tab];
  const loading = activeQuery.isLoading;
  const queryError = activeQuery.isError
    ? (activeQuery.error as any)?.message || "Failed to load report"
    : "";

  const fetchLedgerTransactions = async (ledgerId: string) => {
    if (!selectedFy) return;
    setLedgerDetailLoading(true);
    setVoucherDetail(null);
    try {
      const data = await api.get<LedgerTransactionData>(`/reports/ledger-transactions?ledger_id=${ledgerId}&financial_year_id=${selectedFy}`);
      setLedgerTx(data);
      setShowLedgerDetail(true);
    } catch (err: any) {
      setError(err?.message || "Failed to load ledger transactions");
    } finally {
      setLedgerDetailLoading(false);
    }
  };

  const closeLedgerDetail = () => {
    setShowLedgerDetail(false);
    setLedgerTx(null);
    setVoucherDetail(null);
  };

  const fetchVoucherDetail = async (voucherId: string) => {
    try {
      const data = await api.get<any>(`/vouchers/${voucherId}`);
      const lines = (data.lines || []).map((l: any) => ({
        ledger_id: l.ledger_id,
        ledger_name: l.ledger_name || l.ledger_id,
        debit: l.debit || 0,
        credit: l.credit || 0,
      }));
      setVoucherDetail({ ...data, lines });
    } catch { /* ignore */ }
  };

  // Drill-down: push current detail onto the stack, load the clicked voucher.
  const drillDownVoucher = async (voucherId: string) => {
    if (voucherDetail) setVoucherStack((prev) => [...prev, voucherDetail]);
    await fetchVoucherDetail(voucherId);
  };

  const goBackVoucher = () => {
    const prev = voucherStack[voucherStack.length - 1];
    if (prev) {
      setVoucherStack((s) => s.slice(0, -1));
      setVoucherDetail(prev);
    } else {
      setVoucherDetail(null);
    }
  };

  const closeVoucherDetail = () => {
    setVoucherDetail(null);
    setVoucherStack([]);
  };

  const handleTab = (t: Tab) => {
    setTab(t);
  };

  const tabs = PAGE_TAB_DEFS["/reports"].tabs as PageTabDef<Tab>[];

  const onPreview = (url: string, title: string) => { setPreviewUrl(url); setPreviewTitle(title); };
  const onDownload = (path: string, filename: string) => { downloadFile(path, filename); };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Reports</h1>
        <Select
          value={selectedFy ?? ""}
          onChange={(id) => { if (id) setSelectedFy(id); }}
          options={fys.map((fy) => ({ value: fy.id, label: `${fy.name} (${toDisplayDate(fy.start_date)} to ${toDisplayDate(fy.end_date)})` }))}
          placeholder="Select Financial Year"
          className="w-64"
        />
      </div>
      <Tabs
        tabs={tabs}
        active={tab}
        onChange={(k) => handleTab(k as Tab)}
        compact
      />

      {queryError && <p className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{queryError}</p>}
      {error && <p className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {loading ? (
        <ReportsSkeleton />
      ) : (
        <TabContent activeKey={tab}>
          {tbQuery.data && <TrialBalanceReport data={tbQuery.data} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {pnlQuery.data && <PnlReport data={pnlQuery.data} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {bsQuery.data && <BalanceSheetReport data={bsQuery.data} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {cfQuery.data && <CashFlowReport data={cfQuery.data} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {agingQuery.data && <AgingReport data={agingQuery.data} agingType={agingType} onAgingTypeChange={setAgingType} onFetchReport={fetchReport} selectedFy={selectedFy} onPreview={onPreview} onDownload={onDownload} />}
          {osQuery.data && <OutstandingReport data={osQuery.data} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {regQuery.data && <RegisterReport data={regQuery.data} regVoucherType={regVoucherType} onRegVoucherTypeChange={setRegVoucherType} onFetchReport={fetchReport} selectedFy={selectedFy} onPreview={onPreview} onDownload={onDownload} />}
          {tdsQuery.data && <TdsTcsReport data={tdsQuery.data} tdsTcsType={tdsTcsType} onTdsTcsTypeChange={setTdsTcsType} onFetchReport={fetchReport} selectedFy={selectedFy} onPreview={onPreview} onDownload={onDownload} />}
          {stockSummaryQuery.data && <StockSummaryReport data={stockSummaryQuery.data} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {stockMovementQuery.data && <StockMovementReport data={stockMovementQuery.data} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {stockAgeingQuery.data && <StockAgeingReport data={stockAgeingQuery.data} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
        </TabContent>
      )}

      {showLedgerDetail && ledgerTx && (
        <LedgerDetailModal
          ledgerTx={ledgerTx}
          loading={ledgerDetailLoading}
          selectedFy={selectedFy}
          onClose={closeLedgerDetail}
          onVoucherClick={(id) => {
            // Close the ledger modal so the voucher detail can render (render is gated on !showLedgerDetail).
            setShowLedgerDetail(false);
            fetchVoucherDetail(id);
          }}
          onPreview={onPreview}
        />
      )}

      {voucherDetail && !showLedgerDetail && (
        <VoucherDetailModal
          voucher={voucherDetail}
          onClose={closeVoucherDetail}
          onPreview={onPreview}
          onVoucherClick={drillDownVoucher}
          onBack={voucherStack.length > 0 ? goBackVoucher : undefined}
        />
      )}

      {previewUrl && (
        <PdfPreviewModal
          url={previewUrl}
          title={previewTitle}
          onClose={() => { setPreviewUrl(null); setPreviewTitle(""); }}
        />
      )}
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#1a1a24]">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-[#64748b]">Jump to</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          <Link
            to="/reports/business-intelligence"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] transition-colors hover:text-blue-600 dark:hover:text-blue-400"
          >
            <NavIcon name="chart-bar" className="h-4 w-4" />
            Business Intelligence
          </Link>
          <Link
            to="/reports/aging-analysis"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] transition-colors hover:text-blue-600 dark:hover:text-blue-400"
          >
            <NavIcon name="activity" className="h-4 w-4" />
            Bill-wise Aging
          </Link>
          <Link
            to="/reports/outstanding-bills"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-[#cbd5e1] transition-colors hover:text-blue-600 dark:hover:text-blue-400"
          >
            <NavIcon name="receipt" className="h-4 w-4" />
            Outstanding Bills
          </Link>
        </div>
      </div>
    </div>
  );
}
