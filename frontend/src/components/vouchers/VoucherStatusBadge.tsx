interface VoucherStatusBadgeProps {
  status: string;
  cancelReason?: string | null;
}

export default function VoucherStatusBadge({ status, cancelReason }: VoucherStatusBadgeProps) {
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    draft: {
      bg: "bg-gray-100 dark:bg-gray-500/10",
      text: "text-gray-700 dark:text-gray-400",
      label: "Draft",
    },
    posted: {
      bg: "bg-green-100 dark:bg-green-500/10",
      text: "text-green-700 dark:text-green-400",
      label: "Saved",
    },
    cancelled: {
      bg: "bg-red-100 dark:bg-red-500/10",
      text: "text-red-700 dark:text-red-400",
      label: "Cancelled",
    },
    pending: {
      bg: "bg-yellow-100 dark:bg-yellow-500/10",
      text: "text-yellow-700 dark:text-yellow-400",
      label: "Pending",
    },
    approved: {
      bg: "bg-blue-100 dark:bg-blue-500/10",
      text: "text-blue-700 dark:text-blue-400",
      label: "Approved",
    },
    rejected: {
      bg: "bg-orange-100 dark:bg-orange-500/10",
      text: "text-orange-700 dark:text-orange-400",
      label: "Rejected",
    },
  };

  const badge = badges[status] || {
    bg: "bg-slate-100 dark:bg-slate-500/10",
    text: "text-slate-700 dark:text-slate-400",
    label: status,
  };

  return (
    <div className="inline-flex items-center gap-2">
      <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
      {status === "cancelled" && cancelReason && (
        <span className="text-xs text-slate-500 dark:text-[#94a3b8] italic" title={cancelReason}>
          ({cancelReason.length > 30 ? cancelReason.substring(0, 30) + "..." : cancelReason})
        </span>
      )}
    </div>
  );
}
