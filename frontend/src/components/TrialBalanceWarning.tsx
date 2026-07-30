import { useEffect, useState } from "react";
import { api } from "../api/client";

interface TrialBalanceStatus {
  company_id: number;
  is_balanced: boolean;
  dr_total: number;
  cr_total: number;
  imbalance: number;
  status: "balanced" | "imbalanced";
  message: string;
}

interface TrialBalanceWarningProps {
  companyId: number;
  className?: string;
}

export function TrialBalanceWarning({ companyId, className = "" }: TrialBalanceWarningProps) {
  const [status, setStatus] = useState<"loading" | "balanced" | "imbalanced">("loading");
  const [data, setData] = useState<TrialBalanceStatus | null>(null);

  useEffect(() => {
    if (!companyId) {
      setStatus("loading");
      return;
    }

    api
      .get<TrialBalanceStatus>(`/setup/trial-balance-status/${companyId}`)
      .then((response) => {
        setData(response);
        setStatus(response.is_balanced ? "balanced" : "imbalanced");
      })
      .catch((err) => {
        console.error("Failed to check Trial Balance status:", err);
        setStatus("balanced"); // Fail silently, don't block the UI
      });
  }, [companyId]);

  if (status === "loading" || status === "balanced") {
    return null;
  }

  return (
    <div
      className={`bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/20 rounded-lg p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl">⚠️</div>
        <div className="flex-1">
          <h4 className="font-bold text-yellow-800 dark:text-yellow-200 mb-1">
            Trial Balance Imbalanced
          </h4>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
            {data?.message}
          </p>
          {data && (
            <div className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1">
              <div>
                Opening Balance Totals: Dr ₹
                {data.dr_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })} | Cr ₹
                {data.cr_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <div className="font-semibold">
                Imbalance: ₹
                {data.imbalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 italic">
            Note: This doesn't prevent you from creating vouchers, but reports may be inaccurate
            until opening balances are corrected.
          </p>
        </div>
      </div>
    </div>
  );
}

export default TrialBalanceWarning;
