import { type ReactNode } from "react";

function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 dark:bg-[#252530] ${className}`}
      style={style}
    />
  );
}

function SkeletonText({ lines = 1, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? "w-3/4" : "w-full"}`}
        />
      ))}
    </div>
  );
}

function SkeletonCard({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-[#1e1e28] dark:bg-[#18181f]">
      {children}
    </div>
  );
}

function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-[#1e1e28]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-[#1e1e28] bg-slate-50 dark:bg-[#18181f]/80">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-3 py-2">
                <Skeleton className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr
              key={row}
              className="border-b border-slate-100 dark:border-[#1e1e28]/50"
            >
              {Array.from({ length: cols }).map((_, col) => (
                <td key={col} className="px-3 py-2.5">
                  <Skeleton
                    className={`h-4 ${col === 0 ? "w-20" : col === cols - 1 ? "w-12" : "w-24"}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonStatCard() {
  return (
    <SkeletonCard>
      <Skeleton className="mb-2 h-3 w-20" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="mt-1 h-2 w-16" />
    </SkeletonCard>
  );
}

function SkeletonTree({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ paddingLeft: `${(i % 3) * 24 + 12}px` }}
        >
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className={`h-4 ${i % 3 === 0 ? "w-32" : "w-24"}`} />
          <Skeleton className="ml-auto h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable, SkeletonStatCard, SkeletonTree };
