import { Skeleton, SkeletonCard } from "../../components/Skeleton";

export default function InventorySkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton className="mb-2 h-5 w-28" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-3 w-16" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
