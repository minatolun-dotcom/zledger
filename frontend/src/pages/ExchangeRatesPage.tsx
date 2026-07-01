import { useEffect, useState } from "react";
import { api } from "../api/client";
import Select from "../components/Select";

interface ExchangeRate {
  id: string;
  currency: string;
  rate: number;
  rate_date: string;
}

interface CurrencyOption {
  code: string;
  symbol: string;
}

export default function ExchangeRatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [rateDate, setRateDate] = useState(new Date().toISOString().split("T")[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ExchangeRate[]>("/forex/exchange-rates"),
      api.get<CurrencyOption[]>("/forex/currencies"),
    ]).then(([r, c]) => {
      setRates(r);
      setCurrencies(c);
      if (c.length > 0) setCurrency(c[0].code);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!currency || !rate || !rateDate) {
      setError("All fields are required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.post("/forex/exchange-rates", {
        currency,
        rate: parseFloat(rate),
        rate_date: rateDate,
      });
      const updated = await api.get<ExchangeRate[]>("/forex/exchange-rates");
      setRates(updated);
      setRate("");
    } catch (err: any) {
      setError(err?.detail || "Failed to add exchange rate");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this exchange rate?")) return;
    try {
      await api.del(`/forex/exchange-rates/${id}`);
      setRates(rates.filter((r) => r.id !== id));
    } catch (err: any) {
      setError(err?.detail || "Failed to delete");
    }
  };

  const getSymbol = (code: string) => currencies.find((c) => c.code === code)?.symbol || code;

  const grouped = rates.reduce<Record<string, ExchangeRate[]>>((acc, r) => {
    (acc[r.currency] = acc[r.currency] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">Exchange Rates</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-[#94a3b8]">
          Manage daily exchange rates for foreign currencies against your base currency.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">Add Exchange Rate</h2>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <Select
              value={currency}
              onChange={setCurrency}
              options={currencies.map((c) => ({ value: c.code, label: `${c.code} (${c.symbol})` }))}
              label="Currency"
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Rate (per 1 unit)</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 83.50"
              className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9]"
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-[#94a3b8]">Date</label>
            <input
              type="date"
              value={rateDate}
              onChange={(e) => setRateDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-[#252530] bg-white dark:bg-[#111118] px-3 py-2 text-sm text-slate-800 dark:text-[#f1f5f9]"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="rounded-lg bg-brand-600 dark:bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-violet-600 transition-colors disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-[#1e1e28] bg-white dark:bg-[#18181f] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500 dark:text-[#94a3b8]">Loading...</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500 dark:text-[#94a3b8]">No exchange rates configured yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#1e1e28]">
            {Object.entries(grouped).map(([code, items]) => (
              <div key={code} className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-[#cbd5e1]">
                  {getSymbol(code)} {code}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-[#94a3b8]">
                        <th className="px-2 py-1">Date</th>
                        <th className="px-2 py-1 text-right">Rate</th>
                        <th className="px-2 py-1 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.sort((a, b) => b.rate_date.localeCompare(a.rate_date)).map((r) => (
                        <tr key={r.id} className="border-t border-slate-50 dark:border-[#1e1e28]/50">
                          <td className="px-2 py-1 text-slate-700 dark:text-[#cbd5e1]">{r.rate_date}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-slate-800 dark:text-[#f1f5f9]">{r.rate}</td>
                          <td className="px-2 py-1 text-right">
                            <button onClick={() => handleDelete(r.id)} className="text-red-300 hover:text-red-500 text-xs">&times;</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
