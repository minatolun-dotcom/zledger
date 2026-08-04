import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";

import { toDisplayDate } from "../utils/dateUtils";
import { useFyStore } from "../store/fy";
import Select from "../components/Select";
import Tabs from "../components/Tabs";
import TabContent from "../components/TabContent";
import PdfPreviewModal from "../components/PdfPreviewModal";
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
  const [loading, setLoading] = useState(false);
  const [tbData, setTbData] = useState<TrialBalanceData | null>(null);
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [bsData, setBsData] = useState<BSData | null>(null);
  const [cfData, setCfData] = useState<CashFlowData | null>(null);
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  const [osData, setOsData] = useState<OutstandingData | null>(null);
  const [regData, setRegData] = useState<RegisterData | null>(null);
  const [tdsData, setTdsData] = useState<TdsTcsSummaryData | null>(null);
  const [stockSummaryData, setStockSummaryData] = useState<StockSummaryData | null>(null);
  const [stockMovementData, setStockMovementData] = useState<StockMovementData | null>(null);
  const [stockAgeingData, setStockAgeingData] = useState<StockAgeingData | null>(null);
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
  const tabRef = useRef(tab);
  tabRef.current = tab;

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
    if (selectedFy) fetchReport(paramTab, selectedFy);
  }, [searchParams]);

  const fetchReport = useCallback((tabName: Tab, fyId: string, subType?: string, subVt?: string) => {
    if (!fyId) return;
    setLoading(true);
    setError("");
    setTbData(null);
    setPnlData(null);
    setBsData(null);
    setCfData(null);
    setAgingData(null);
    setOsData(null);
    setRegData(null);
    setTdsData(null);
    setStockSummaryData(null);
    setStockMovementData(null);
    setStockAgeingData(null);

    let endpoint = `/reports/${tabName}?financial_year_id=${fyId}`;
    if (tabName === "aging") endpoint += `&type=${subType || agingType}`;
    if (tabName === "register") endpoint += `&voucher_type=${subVt || regVoucherType}`;
    if (tabName === "tds-tcs") endpoint = `/reports/tds-tcs-summary?financial_year_id=${fyId}&tds_tcs_type=${subType || tdsTcsType}`;
    if (tabName === "stock-summary" || tabName === "stock-movement" || tabName === "stock-ageing") {
      endpoint = `/reports/${tabName}`;
    }

    api.get<any>(endpoint)
      .then((data) => {
        if (tabName === "trial-balance") setTbData(data as TrialBalanceData);
        else if (tabName === "profit-and-loss") setPnlData(data as PnLData);
        else if (tabName === "balance-sheet") setBsData(data as BSData);
        else if (tabName === "cash-flow") setCfData(data as CashFlowData);
        else if (tabName === "aging") setAgingData(data as AgingData);
        else if (tabName === "outstanding") setOsData(data as OutstandingData);
        else if (tabName === "register") setRegData(data as RegisterData);
        else if (tabName === "tds-tcs") setTdsData(data as TdsTcsSummaryData);
        else if (tabName === "stock-summary") setStockSummaryData(data as StockSummaryData);
        else if (tabName === "stock-movement") setStockMovementData(data as StockMovementData);
        else if (tabName === "stock-ageing") setStockAgeingData(data as StockAgeingData);
      })
      .catch((err: any) => setError(err?.message || "Failed to load report"))
      .finally(() => setLoading(false));
  }, [agingType, regVoucherType, tdsTcsType]);

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
    if (selectedFy) fetchReport(t, selectedFy);
  };

  useEffect(() => {
    if (selectedFy) fetchReport(tabRef.current, selectedFy);
  }, [selectedFy, fetchReport]);

  const tabs: { key: Tab; label: string; shortcut?: string }[] = [
    { key: "trial-balance", label: "Trial Balance", shortcut: "F1" },
    { key: "profit-and-loss", label: "Profit & Loss", shortcut: "F2" },
    { key: "balance-sheet", label: "Balance Sheet", shortcut: "F3" },
    { key: "cash-flow", label: "Cash Flow", shortcut: "F4" },
    { key: "aging", label: "Aging", shortcut: "F5" },
    { key: "outstanding", label: "Outstanding", shortcut: "F6" },
    { key: "register", label: "Register", shortcut: "F7" },
    { key: "tds-tcs", label: "TDS/TCS", shortcut: "F8" },
    { key: "stock-summary", label: "Stock Summary", shortcut: "F9" },
    { key: "stock-movement", label: "Stock Movement", shortcut: "F10" },
    { key: "stock-ageing", label: "Stock Ageing", shortcut: "F11" },
  ];

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

      {error && <p className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {loading ? (
        <ReportsSkeleton />
      ) : (
        <TabContent activeKey={tab}>
          {tbData && <TrialBalanceReport data={tbData} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {pnlData && <PnlReport data={pnlData} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {bsData && <BalanceSheetReport data={bsData} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {cfData && <CashFlowReport data={cfData} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {agingData && <AgingReport data={agingData} agingType={agingType} onAgingTypeChange={setAgingType} onFetchReport={fetchReport} selectedFy={selectedFy} onPreview={onPreview} onDownload={onDownload} />}
          {osData && <OutstandingReport data={osData} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {regData && <RegisterReport data={regData} regVoucherType={regVoucherType} onRegVoucherTypeChange={setRegVoucherType} onFetchReport={fetchReport} selectedFy={selectedFy} onPreview={onPreview} onDownload={onDownload} />}
          {tdsData && <TdsTcsReport data={tdsData} tdsTcsType={tdsTcsType} onTdsTcsTypeChange={setTdsTcsType} onFetchReport={fetchReport} selectedFy={selectedFy} onPreview={onPreview} onDownload={onDownload} />}
          {stockSummaryData && <StockSummaryReport data={stockSummaryData} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {stockMovementData && <StockMovementReport data={stockMovementData} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
          {stockAgeingData && <StockAgeingReport data={stockAgeingData} onLedgerClick={fetchLedgerTransactions} onPreview={onPreview} onDownload={onDownload} />}
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
      <div className="mt-4 pt-4 border-t space-y-2">
        <a href="/reports/business-intelligence" className="text-sm text-blue-600 hover:underline">
          📊 Business Intelligence & Analytics Dashboard
        </a>
        <div className="flex gap-6">
          <a href="/reports/aging-analysis" className="text-sm text-blue-600 hover:underline">
            ⏳ Bill-wise Aging Analysis
          </a>
          <a href="/reports/outstanding-bills" className="text-sm text-blue-600 hover:underline">
            📋 Outstanding Bills by Party
          </a>
        </div>
      </div>
    </div>
  );
}
