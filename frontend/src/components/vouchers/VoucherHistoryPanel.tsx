import { useState } from "react";
import { api } from "../../api/client";

interface VoucherVersion {
  id: string;
  version_number: number;
  change_type: string;
  change_reason: string | null;
  modified_by: string | null;
  modified_by_name: string | null;
  created_at: string;
  voucher_snapshot: any;
  lines_snapshot: any[];
  ip_address: string | null;
}

interface VoucherHistoryPanelProps {
  voucherId: string;
  onClose: () => void;
}

export default function VoucherHistoryPanel({ voucherId, onClose }: VoucherHistoryPanelProps) {
  const [versions, setVersions] = useState<VoucherVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<VoucherVersion | null>(null);

  useState(() => {
    loadHistory();
  });

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ voucher_id: string; versions: VoucherVersion[] }>(
        `/vouchers/${voucherId}/history`
      );
      setVersions(response.versions);
    } catch (err: any) {
      setError(err?.message || "Failed to load version history");
    } finally {
      setLoading(false);
    }
  };

  const getChangeTypeBadge = (changeType: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      update: { bg: "bg-blue-100 dark:bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", label: "Updated" },
      cancel: { bg: "bg-red-100 dark:bg-red-500/10", text: "text-red-700 dark:text-red-400", label: "Cancelled" },
      restore: { bg: "bg-green-100 dark:bg-green-500/10", text: "text-green-700 dark:text-green-400", label: "Restored" },
    };
    const badge = badges[changeType] || { bg: "bg-gray-100 dark:bg-gray-500/10", text: "text-gray-700 dark:text-gray-400", label: changeType };
    return (
      <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-IN", { 
      year: "numeric", 
      month: "short", 
      day: "numeric", 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-[#16161f] rounded-lg p-8 max-w-4xl w-full mx-4">
          <p className="text-center text-slate-600 dark:text-[#cbd5e1]">Loading version history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-[#16161f] rounded-lg p-8 max-w-4xl w-full mx-4">
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
      <div className="bg-white dark:bg-[#16161f] rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-[#282832]">
          <h2 className="text-xl font-bold text-slate-900 dark:text-[#f1f5f9]">Version History</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-[#f1f5f9] text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Version List */}
          <div className="w-1/3 border-r border-slate-200 dark:border-[#282832] overflow-y-auto">
            {versions.length === 0 ? (
              <div className="p-6 text-center text-slate-500 dark:text-[#94a3b8]">
                No version history available
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-[#282832]">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    onClick={() => setSelectedVersion(version)}
                    className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-[#1a1a24] transition-colors ${
                      selectedVersion?.id === version.id ? "bg-slate-50 dark:bg-[#1a1a24]" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
                        Version {version.version_number}
                      </span>
                      {getChangeTypeBadge(version.change_type)}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-[#cbd5e1] mb-1">
                      {version.modified_by_name || "System"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#94a3b8]">
                      {formatDate(version.created_at)}
                    </p>
                    {version.change_reason && (
                      <p className="text-xs text-slate-500 dark:text-[#94a3b8] mt-2 italic">
                        "{version.change_reason}"
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Version Details */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selectedVersion ? (
              <div className="text-center text-slate-500 dark:text-[#94a3b8] py-12">
                Select a version to view details
              </div>
            ) : (
              <div className="space-y-6">
                {/* Version Header */}
                <div className="border-b border-slate-200 dark:border-[#282832] pb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-[#f1f5f9] mb-2">
                    Version {selectedVersion.version_number} Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500 dark:text-[#94a3b8]">Modified by:</span>
                      <span className="ml-2 text-slate-900 dark:text-[#f1f5f9] font-medium">
                        {selectedVersion.modified_by_name || "System"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-[#94a3b8]">Date:</span>
                      <span className="ml-2 text-slate-900 dark:text-[#f1f5f9] font-medium">
                        {formatDate(selectedVersion.created_at)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500 dark:text-[#94a3b8]">Change type:</span>
                      <span className="ml-2">{getChangeTypeBadge(selectedVersion.change_type)}</span>
                    </div>
                    {selectedVersion.ip_address && (
                      <div className="col-span-2">
                        <span className="text-slate-500 dark:text-[#94a3b8]">IP Address:</span>
                        <span className="ml-2 text-slate-900 dark:text-[#f1f5f9] font-mono text-xs">
                          {selectedVersion.ip_address}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Voucher Snapshot */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9] mb-3">Voucher Details</h4>
                  <div className="bg-slate-50 dark:bg-[#1a1a24] rounded-lg p-4 space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 dark:text-[#94a3b8]">Voucher Number:</span>
                        <span className="ml-2 text-slate-900 dark:text-[#f1f5f9] font-medium">
                          {selectedVersion.voucher_snapshot.voucher_number}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-[#94a3b8]">Date:</span>
                        <span className="ml-2 text-slate-900 dark:text-[#f1f5f9] font-medium">
                          {new Date(selectedVersion.voucher_snapshot.voucher_date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500 dark:text-[#94a3b8]">Grand Total:</span>
                        <span className="ml-2 text-slate-900 dark:text-[#f1f5f9] font-bold">
                          ₹{parseFloat(selectedVersion.voucher_snapshot.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lines Snapshot */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-[#f1f5f9] mb-3">
                    Voucher Lines ({selectedVersion.lines_snapshot.length})
                  </h4>
                  <div className="border border-slate-200 dark:border-[#282832] rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-[#1a1a24]">
                        <tr>
                          <th className="text-left px-3 py-2 text-slate-600 dark:text-[#cbd5e1] font-semibold">Ledger</th>
                          <th className="text-right px-3 py-2 text-slate-600 dark:text-[#cbd5e1] font-semibold">Debit</th>
                          <th className="text-right px-3 py-2 text-slate-600 dark:text-[#cbd5e1] font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-[#282832]">
                        {selectedVersion.lines_snapshot.map((line, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-slate-900 dark:text-[#f1f5f9]">
                              {line.ledger_id || "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-900 dark:text-[#f1f5f9]">
                              {line.debit > 0 ? `₹${parseFloat(line.debit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-900 dark:text-[#f1f5f9]">
                              {line.credit > 0 ? `₹${parseFloat(line.credit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
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
