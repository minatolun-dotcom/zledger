import { Skeleton, SkeletonCard, SkeletonTable } from "../../components/Skeleton";

export default function ListSkeleton({ title, cols = 4, rows = 5 }: { title?: string; cols?: number; rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {title ? <Skeleton className="h-6 w-40" /> : <Skeleton className="h-6 w-32" />}
        <Skeleton className="h-9 w-28" />
      </div>
      <SkeletonCard>
        <SkeletonTable rows={rows} cols={cols} />
      </SkeletonCard>
    </div>
  );
}
