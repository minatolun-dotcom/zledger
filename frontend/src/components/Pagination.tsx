import Select from "./Select";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
  /** Label prefix for the count, e.g. "vouchers" or "entries". */
  itemLabel?: string;
}

function PageButton({
  disabled,
  onClick,
  label,
  active,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[28px] rounded px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-brand-600 text-white"
          : disabled
          ? "text-slate-300 dark:text-[#475569] cursor-not-allowed"
          : "text-slate-600 dark:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#282832]"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Shared server-side pagination. Shows a windowed set of page-number buttons
 * (up to 7) with an active highlight, plus an optional rows-per-page selector.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [25, 50, 100, 200],
  itemLabel = "items",
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1 && !onPageSizeChange) return null;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#cbd5e1]">
        {onPageSizeChange && (
          <>
            <span>Rows per page:</span>
            <Select
              value={String(pageSize)}
              onChange={(v) => onPageSizeChange(Number(v))}
              options={pageSizes.map((s) => ({ value: String(s), label: String(s) }))}
              className="w-16"
            />
          </>
        )}
        <span>
          {start}–{end} of {total.toLocaleString()} {itemLabel}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <PageButton disabled={page <= 1} onClick={() => onPageChange(1)} label="<<" />
        <PageButton disabled={page <= 1} onClick={() => onPageChange(page - 1)} label="<" />
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const windowStart = Math.max(1, Math.min(page - 3, totalPages - 6));
          const p = windowStart + i;
          if (p > totalPages) return null;
          return (
            <PageButton
              key={p}
              disabled={false}
              active={p === page}
              onClick={() => onPageChange(p)}
              label={String(p)}
            />
          );
        })}
        <PageButton
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          label=">"
        />
        <PageButton
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          label=">>"
        />
      </div>
    </div>
  );
}
