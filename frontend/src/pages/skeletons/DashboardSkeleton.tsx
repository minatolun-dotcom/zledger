import { Skeleton, SkeletonText, SkeletonCard, SkeletonStatCard } from "../../components/Skeleton";

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* FY selector bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <SkeletonCard>
            <Skeleton className="mb-3 h-5 w-32" />
            <SkeletonText lines={3} />
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="mb-3 h-5 w-40" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>

        {/* Sidebar (1 col) */}
        <div className="space-y-4">
          <SkeletonCard>
            <Skeleton className="mb-3 h-5 w-28" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-[#1a1a24] dark:bg-[#16161f]/80">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-6" />
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="mb-3 h-5 w-32" />
            <SkeletonText lines={2} />
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}
