/** Business Intelligence & Analytics Dashboard */
import { useState, useEffect, useCallback } from "react";
import { api } from "../../api/client";
import { useFyStore } from "../../store/fy";
import { useFinancialYears } from "../../hooks/useMasterData";
import { toDisplayDate } from "../../utils/dateUtils";
import Select from "../../components/Select";
import Button from "../../components/Button";

// Types
interface SummaryCard {
  title: string;
  value: string;
  trend: "up" | "down" | "neutral";
}

interface RecentActivityItem {
  voucher_type: string;
  voucher_number: string;
  date: string;
  amount: number;
}

interface ExecutiveSummary {
  financial_year: string;
  summary_cards: SummaryCard[];
  recent_activity: RecentActivityItem[];
}

interface TrendPoint {
  month: string;
  revenue?: number;
  expenses?: number;
  profit?: number;
  voucher_count?: number;
}

interface SmartInsight {
  type: "positive" | "warning" | "info";
  title: string;
  message: string;
  impact: "high" | "medium" | "low";
}

interface CustomerData {
  customer_name: string;
  party_id: string;
  total_revenue: number;
  transaction_count: number;
}

interface SupplierData {
  supplier_name: string;
  party_id: string;
  total_purchases: number;
  transaction_count: number;
}

interface ExpenseGroup {
  group_name: string;
  group_id: string;
  total_expense: number;
}

interface StockItem {
  item_name: string;
  item_id: string;
  quantity: number;
  rate: number;
  value: number;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

// Format helpers
const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const CARD_COLORS = ["#22c55e", "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#f97316", "#14b8a6", "#6366f1"];

const CARD =
  "rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25]";

const MUTED = "text-sm text-slate-500 dark:text-[#94a3b8]";

// KPI Card
function KPICard({
  title,
  value,
  trend,
  icon,
  color,
}: {
  title: string;
  value: string;
  trend?: "up" | "down";
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className={`${CARD} border-l-4`} style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className={MUTED}>{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">{value}</p>
          {trend !== undefined && (
            <p className={`mt-1 text-xs ${trend === "up" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {trend === "up" ? "↑" : "↓"} vs prev. period
            </p>
          )}
        </div>
        <div
          className="rounded-full p-2.5"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// Insight Card
function InsightCard({ insight }: { insight: SmartInsight }) {
  const typeColors: Record<SmartInsight["type"], string> = {
    positive: "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/30",
    info: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30",
  };
  const impactBorders: Record<SmartInsight["impact"], string> = {
    high: "border-l-red-500",
    medium: "border-l-yellow-500",
    low: "border-l-blue-500",
  };

  return (
    <div className={`${CARD} border-l-4 ${impactBorders[insight.impact]}`}>
      <div className="flex items-start gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColors[insight.type]}`}>
          {insight.type}
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{insight.title}</p>
          <p className={`${MUTED} mt-0.5`}>{insight.message}</p>
        </div>
      </div>
    </div>
  );
}

// Section card wrapper
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={CARD}>
      <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">{title}</h3>
      {children}
    </div>
  );
}

// Heroicons (outline) paths, matching the project's inline-SVG icon pattern
const ICONS = {
  up: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>,
  down: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" /></svg>,
  cash: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
  users: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
  refresh: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>,
};

// Main BI Dashboard
export default function BusinessIntelligencePage() {
  const { data: fys = [] } = useFinancialYears();
  const { activeFyId: selectedFy, setActiveFy: setSelectedFy } = useFyStore();

  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [revenueTrends, setRevenueTrends] = useState<TrendPoint[]>([]);
  const [expenseTrends, setExpenseTrends] = useState<TrendPoint[]>([]);
  const [profitTrends, setProfitTrends] = useState<TrendPoint[]>([]);
  const [customerAnalytics, setCustomerAnalytics] = useState<{ top_customers_by_revenue: CustomerData[] } | null>(null);
  const [supplierAnalytics, setSupplierAnalytics] = useState<{ top_suppliers_by_purchase: SupplierData[] } | null>(null);
  const [expenseAnalysis, setExpenseAnalysis] = useState<{ expense_by_group: ExpenseGroup[] } | null>(null);
  const [inventoryAnalytics, setInventoryAnalytics] = useState<{ stock_valuation: StockItem[]; total_stock_value: number } | null>(null);
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (fys.length > 0 && (!selectedFy || !fys.some((f) => f.id === selectedFy))) {
      setSelectedFy(fys[fys.length - 1].id);
    }
  }, [fys, selectedFy, setSelectedFy]);

  const loadDashboard = useCallback(async () => {
    if (!selectedFy) return;
    setLoading(true);
    setError("");
    try {
      const [summaryRes, revRes, expRes, profitRes, custRes, suppRes, expCatRes, invRes, insightsRes] =
        await Promise.all([
          api.get<Envelope<ExecutiveSummary>>(`/dashboard/executive-summary?financial_year_id=${selectedFy}`),
          api.get<Envelope<TrendPoint[]>>(`/dashboard/revenue-trends?financial_year_id=${selectedFy}`),
          api.get<Envelope<TrendPoint[]>>(`/dashboard/expense-trends?financial_year_id=${selectedFy}`),
          api.get<Envelope<TrendPoint[]>>(`/dashboard/profit-trends?financial_year_id=${selectedFy}`),
          api.get<Envelope<{ top_customers_by_revenue: CustomerData[] }>>(`/dashboard/customer-analytics?financial_year_id=${selectedFy}`),
          api.get<Envelope<{ top_suppliers_by_purchase: SupplierData[] }>>(`/dashboard/supplier-analytics?financial_year_id=${selectedFy}`),
          api.get<Envelope<{ expense_by_group: ExpenseGroup[] }>>(`/dashboard/expense-analysis?financial_year_id=${selectedFy}`),
          api.get<Envelope<{ stock_valuation: StockItem[]; total_stock_value: number }>>(`/dashboard/inventory-analytics?financial_year_id=${selectedFy}`),
          api.get<Envelope<SmartInsight[]>>(`/dashboard/smart-insights?financial_year_id=${selectedFy}`),
        ]);
      setSummary(summaryRes.data);
      setRevenueTrends(revRes.data);
      setExpenseTrends(expRes.data);
      setProfitTrends(profitRes.data);
      setCustomerAnalytics(custRes.data);
      setSupplierAnalytics(suppRes.data);
      setExpenseAnalysis(expCatRes.data);
      setInventoryAnalytics(invRes.data);
      setSmartInsights(insightsRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [selectedFy]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const kpiCards = summary
    ? summary.summary_cards.map((card, i) => ({
        title: card.title,
        value: card.value,
        icon: card.trend === "down" ? ICONS.down : card.trend === "up" ? ICONS.up : ICONS.cash,
        color: CARD_COLORS[i % CARD_COLORS.length],
        trend: card.trend === "neutral" ? undefined : card.trend,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9]">Business Intelligence Dashboard</h1>
          <p className={MUTED}>Comprehensive analytics and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedFy ?? ""}
            onChange={(id) => { if (id) setSelectedFy(id); }}
            options={fys.map((fy) => ({ value: fy.id, label: `${fy.name} (${toDisplayDate(fy.start_date)} to ${toDisplayDate(fy.end_date)})` }))}
            placeholder="Select Financial Year"
            className="w-64"
          />
          <Button onClick={loadDashboard} disabled={loading}>
            <span className={`mr-1.5 ${loading ? "animate-spin" : ""}`}>{ICONS.refresh}</span>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {loading && !summary ? (
        <p className={MUTED}>Loading analytics…</p>
      ) : (
        <>
          {/* KPI Cards */}
          {summary && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {kpiCards.map((card) => (
                <KPICard key={card.title} {...card} />
              ))}
            </div>
          )}

          {/* Recent Activity */}
          {summary?.recent_activity?.length ? (
            <SectionCard title="Recent Activity">
              <div className="space-y-2">
                {summary.recent_activity.map((act, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1">
                    <span className="text-sm text-slate-700 dark:text-[#cbd5e1]">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-[#1a1a24] dark:text-[#94a3b8]">
                        {act.voucher_type}
                      </span>
                      {act.voucher_number}
                      <span className={MUTED}> · {act.date}</span>
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{formatCurrency(act.amount)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          {/* Smart Insights */}
          {smartInsights.length > 0 && (
            <SectionCard title="Smart Insights">
              <div className="space-y-3">
                {smartInsights.map((insight, idx) => (
                  <InsightCard key={idx} insight={insight} />
                ))}
              </div>
            </SectionCard>
          )}

          {/* Revenue, Expense & Profit Trends */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <SectionCard title="Revenue Trends">
              {revenueTrends.length > 0 ? (
                <div className="space-y-2">
                  {revenueTrends.map((point, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className={MUTED}>{point.month}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{formatCurrency(point.revenue || 0)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={MUTED}>No data available</p>
              )}
            </SectionCard>

            <SectionCard title="Expense Trends">
              {expenseTrends.length > 0 ? (
                <div className="space-y-2">
                  {expenseTrends.map((point, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className={MUTED}>{point.month}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{formatCurrency(point.expenses || 0)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={MUTED}>No data available</p>
              )}
            </SectionCard>

            <SectionCard title="Profit Trends">
              {profitTrends.length > 0 ? (
                <div className="space-y-2">
                  {profitTrends.map((point, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className={MUTED}>{point.month}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{formatCurrency(point.profit || 0)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={MUTED}>No data available</p>
              )}
            </SectionCard>
          </div>

          {/* Customer & Supplier Analytics */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionCard title="Top Customers">
              {customerAnalytics?.top_customers_by_revenue?.length ? (
                <div className="space-y-2">
                  {customerAnalytics.top_customers_by_revenue.map((cust, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className="text-sm text-slate-700 dark:text-[#cbd5e1]">{cust.customer_name}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{formatCurrency(cust.total_revenue)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={MUTED}>No customer data available</p>
              )}
            </SectionCard>

            <SectionCard title="Top Suppliers">
              {supplierAnalytics?.top_suppliers_by_purchase?.length ? (
                <div className="space-y-2">
                  {supplierAnalytics.top_suppliers_by_purchase.map((supp, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className="text-sm text-slate-700 dark:text-[#cbd5e1]">{supp.supplier_name}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{formatCurrency(supp.total_purchases)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={MUTED}>No supplier data available</p>
              )}
            </SectionCard>
          </div>

          {/* Expense Category Analysis */}
          <SectionCard title="Expense Breakdown by Category">
            {expenseAnalysis?.expense_by_group?.length ? (
              <div className="space-y-2">
                {expenseAnalysis.expense_by_group.map((group, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1">
                    <span className="text-sm text-slate-700 dark:text-[#cbd5e1]">{group.group_name}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{formatCurrency(group.total_expense)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={MUTED}>No expense data available</p>
            )}
          </SectionCard>

          {/* Inventory Analytics */}
          <SectionCard title="Inventory Valuation">
            {inventoryAnalytics?.stock_valuation?.length ? (
              <>
                <p className={`${MUTED} mb-3`}>Total Stock Value: {formatCurrency(inventoryAnalytics.total_stock_value)}</p>
                <div className="space-y-2">
                  {inventoryAnalytics.stock_valuation.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className="text-sm text-slate-700 dark:text-[#cbd5e1]">{item.item_name}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={MUTED}>No inventory data available</p>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
