import { useState } from "react";
import ContextMenu from "../ContextMenu";

interface VoucherQuickActionsProps {
  voucherNumber: string;
  voucherType: string;
  /** True when the voucher is cancelled (disables Cancel + enables Restore). */
  cancelled?: boolean;
  /** Draft vouchers cannot be cancelled. */
  isDraft?: boolean;
  /** Draft voucher submitted for approval (awaiting approve/reject). */
  isPending?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onPrint?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  /** Submit a draft for approval (draft → pending). */
  onSubmit?: () => void;
  /** Approve a pending voucher (pending → posted). */
  onApprove?: () => void;
  /** Reject a pending voucher (pending → draft). */
  onReject?: () => void;
}

/**
 * Per-row kebab menu for voucher lists (Day Book, Voucher List, Registers).
 * Uses the themed portal ContextMenu so items render correctly in dark mode.
 */
export default function VoucherQuickActions({
  voucherNumber,
  voucherType,
  cancelled = false,
  isDraft = false,
  isPending = false,
  onView,
  onEdit,
  onDuplicate,
  onPrint,
  onCancel,
  onDelete,
  onSubmit,
  onApprove,
  onReject,
}: VoucherQuickActionsProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const items = [
    onView && { label: "View", onClick: onView },
    isPending ? [
      onApprove && { label: "Approve", onClick: onApprove },
      onReject && { label: "Reject", danger: true as const, onClick: onReject },
    ] : [
      isDraft && onSubmit && { label: "Submit for Approval", onClick: onSubmit },
    ],
    onEdit && { label: "Edit", onClick: onEdit },
    onDuplicate && { label: "Duplicate", onClick: onDuplicate },
    onPrint && { label: "Print PDF", onClick: onPrint },
    !cancelled && onCancel && { label: "Cancel", danger: true as const, disabled: isDraft || isPending, onClick: onCancel },
    onDelete && { label: "Delete", danger: true as const, onClick: onDelete },
  ].flat().filter(Boolean) as { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[];

  return (
    <>
      <button
        aria-label={`Actions for ${voucherNumber} (${voucherType})`}
        onClick={openMenu}
        className="rounded-md p-1 text-slate-400 dark:text-[#64748b] hover:bg-slate-100 dark:hover:bg-[#1a1a24] hover:text-slate-600 dark:hover:text-[#e2e8f0] transition-colors"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={items}
        />
      )}
    </>
  );
}
