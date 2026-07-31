import { useState, useEffect } from "react";
import { api } from "../../api/client";

interface AuditEntry {
  id: string;
  action: string;
  user_id: string | null;
  user_name: string;
  created_at: string;
  description: string | null;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  user_agent: string | null;
}

interface VoucherAuditTimelineProps {
  voucherId: string;
  onClose: () => void;
}

export default function VoucherAuditTimeline({ voucherId, onClose }: VoucherAuditTimelineProps) {
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAuditTrail();
  }, [voucherId]);

  const loadAuditTrail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ voucher_id: string; audit_trail: AuditEntry[] }>(
        `/vouchers/${voucherId}/audit`
      );
      setAuditTrail(response.audit_trail);
    } catch (err: any) {
      setError(err?.message || "Failed to load audit trail");
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    const badges: Record<string, { bg: string; text: string; icon: string }> = {
      CREATE: { bg: "bg-green-100 dark:bg-green-500/10", text: "text-green-700 dark:text-green-400", icon: "+" },
      UPDATE: { bg: "bg-blue-100 dark:bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", icon: "✎" },
      DELETE: { bg: "bg-red-100 dark:bg-red-500/10", text: "text-red-700 dark:text-red-400", icon: "×" },
      CANCEL: { bg: "bg-orange-100 dark:bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", icon: "⊘" },
      RESTORE: { bg: "bg-emerald-100 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", icon: "↺" },
    };
    const badge = badges[action] || { bg: "bg-gray-100 dark:bg-gray-500/10", text: "text-gray-700 dark:text-gray-400", icon: "•" };
    return (
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${badge.bg} ${badge.text} font-bold text-sm`}>
        {badge.icon}
      </div>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

    return date.toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-[#16161f] rounded-lg p-8 max-w-3xl w-full mx-4">
          <p className="text-center text-slate-600 dark:text-[#cbd5e1]">Loading audit trail...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-[#16161f] rounded-lg p-8 max-w-3xl w-full mx-4">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 dark:bg-[#282832] text-slate-700 dark:text-[#cbd5e1] rounded-lg hover:bg-slate-300 dark:hover:bg-[#1a1a24]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#16161f] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-[#282832]">
          <h2 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">Audit Trail</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-[#f1f5f9] text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-6">
          {auditTrail.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-[#94a3b8]">
              No audit entries found
            </div>
          ) : (
            <div className="relative">
              {/* Timeline Line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-[#282832]" />

              <div className="space-y-6">
                {auditTrail.map((entry) => (
                  <div key={entry.id} className="relative pl-12">
                    {/* Action Badge */}
                    <div className="absolute left-0 top-0">
                      {getActionBadge(entry.action)}
                    </div>

                    {/* Entry Content */}
                    <div className="bg-slate-50 dark:bg-[#1a1a24] rounded-lg p-4 border border-slate-200 dark:border-[#282832]">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-[#f1f5f9]">
                            {entry.action}
                          </span>
                          <span className="text-slate-500 dark:text-[#94a3b8] text-sm ml-2">
                            by {entry.user_name}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-[#94a3b8]">
                          {formatDate(entry.created_at)}
                        </span>
                      </div>

                      {entry.description && (
                        <p className="text-sm text-slate-700 dark:text-[#cbd5e1] mb-3">
                          {entry.description}
                        </p>
                      )}

                      {/* Metadata */}
                      {(entry.ip_address || entry.user_agent) && (
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[#282832] space-y-1">
                          {entry.ip_address && (
                            <div className="text-xs text-slate-500 dark:text-[#94a3b8]">
                              <span className="font-medium">IP:</span>{" "}
                              <span className="font-mono">{entry.ip_address}</span>
                            </div>
                          )}
                          {entry.user_agent && (
                            <div className="text-xs text-slate-500 dark:text-[#94a3b8]">
                              <span className="font-medium">Device:</span>{" "}
                              <span className="truncate inline-block max-w-md">{entry.user_agent}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-200 dark:border-[#282832]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-[#282832] text-slate-700 dark:text-[#cbd5e1] rounded-lg hover:bg-slate-300 dark:hover:bg-[#1a1a24] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
