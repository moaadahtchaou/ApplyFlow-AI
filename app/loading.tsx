import { SkeletonMetrics, SkeletonTable } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-72" />
        </div>
        <div className="skeleton h-10 w-32 rounded-lg" />
      </div>

      <SkeletonMetrics count={5} />
      <SkeletonTable rows={6} />
    </div>
  );
}
