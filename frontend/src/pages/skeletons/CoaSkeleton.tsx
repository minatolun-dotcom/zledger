import { Skeleton, SkeletonCard, SkeletonTree } from "../../components/Skeleton";

export default function CoaSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header + search */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-32" />
      </div>

      {/* Tree */}
      <SkeletonCard>
        <SkeletonTree rows={8} />
      </SkeletonCard>
    </div>
  );
}
