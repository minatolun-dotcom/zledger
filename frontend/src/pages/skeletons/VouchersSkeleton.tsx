import { Skeleton, SkeletonTable } from "../../components/Skeleton";

export default function VouchersSkeleton() {
  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 shrink-0 rounded-lg px-4" style={{ width: `${60 + (i % 3) * 12}px` }} />
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-32" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Table */}
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}
