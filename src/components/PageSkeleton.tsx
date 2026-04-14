import { Skeleton } from "@/components/ui/skeleton";

/** Full-page skeleton loader for instant layout render */
export const PageSkeleton = () => (
  <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-150">
    {/* Header skeleton */}
    <div className="flex items-center justify-between">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-9" />
      </div>
    </div>
    {/* Stats row */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
    {/* Table skeleton */}
    <div className="rounded-xl border border-border/40 bg-card">
      <div className="p-4 space-y-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  </div>
);

/** Dashboard-specific skeleton */
export const DashboardSkeleton = () => (
  <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-150">
    {/* Welcome banner */}
    <Skeleton className="h-40 w-full rounded-2xl" />
    {/* Quick actions */}
    <div className="flex gap-2 overflow-hidden">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-[72px] rounded-xl flex-shrink-0" />
      ))}
    </div>
    {/* Analytics cards */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
    {/* Chart */}
    <Skeleton className="h-64 w-full rounded-xl" />
  </div>
);

export default PageSkeleton;
