import { Skeleton, SkeletonCard, SkeletonTable } from "../../components/Skeleton";

export default function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      {/* FY selector */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-48" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-lg px-4" style={{ width: `${70 + (i % 3) * 10}px` }} />
        ))}
      </div>

      {/* Report content */}
      <SkeletonCard>
        <Skeleton className="mb-4 h-5 w-48" />
        <div className="mb-4 flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <SkeletonTable rows={8} cols={5} />
        <div className="mt-4 flex justify-end gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      </SkeletonCard>
    </div>
  );
}
