import { Skeleton, SkeletonCard, SkeletonStatCard } from "../../components/Skeleton";

export default function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stat cards grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SkeletonCard>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-7 w-32" />
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-40 w-full" />
            </div>
          </SkeletonCard>
        </div>
        <div className="lg:col-span-2">
          <SkeletonCard>
            <Skeleton className="h-5 w-32" />
            <div className="mt-4 flex justify-center">
              <Skeleton className="h-40 w-40 rounded-full" />
            </div>
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          </div>
        </SkeletonCard>
        <SkeletonCard>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          </div>
        </SkeletonCard>
      </div>

      {/* Pending + Recent */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <SkeletonCard>
            <Skeleton className="mb-3 h-5 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>
        <div className="lg:col-span-3">
          <SkeletonCard>
            <Skeleton className="mb-3 h-5 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <Skeleton className="h-6 w-14 rounded-md" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>

      {/* Quick actions */}
      <SkeletonCard>
        <Skeleton className="mb-3 h-5 w-28" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2.5 dark:border-[#1a1a24]">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
