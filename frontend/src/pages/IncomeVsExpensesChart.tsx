import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useFyStore } from "../store/fy";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Select from "../components/Select";

interface ChartDataPoint {
  month: string;
  income: number;
  expenses: number;
}

type TimePeriod = "12" | "6" | "3";

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function IncomeVsExpensesChart() {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [period, setPeriod] = useState<TimePeriod>("12");
  const { activeFyId } = useFyStore();

  useEffect(() => {
    if (!activeFyId) return;
    api.get<ChartDataPoint[]>(`/dashboard/chart-data?financial_year_id=${activeFyId}`)
      .then(setData)
      .catch(() => {});
  }, [activeFyId]);

  if (!data.length) return null;

  // Slice data based on selected period
  const slicedData = data.slice(-Number(period));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-[#282832] dark:bg-[#1e1e28]">
          <p className="text-xs font-semibold text-slate-700 dark:text-[#cbd5e1]">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: ₹{fmt(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm dark:border-[#1a1a24] dark:from-[#16161f] dark:to-[#1a1a25]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Income vs Expenses</h3>
        <Select
          value={period}
          onChange={(v) => setPeriod(v as TimePeriod)}
          options={[
            { value: "12", label: "Last 12 Months" },
            { value: "6", label: "Last 6 Months" },
            { value: "3", label: "Last 3 Months" },
          ]}
        />
      </div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={slicedData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-[#282832]" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
            tickFormatter={(v) => `₹${fmt(v)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconType="circle"
            iconSize={8}
          />
          <Line
            type="monotone"
            dataKey="income"
            name="Income"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3, fill: "#10b981" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            name="Expenses"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3, fill: "#ef4444" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
