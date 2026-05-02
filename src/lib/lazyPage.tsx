import { Suspense, lazy, ComponentType } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";

/** Skeleton wrapped in a full-height background so chunk loads never flash white. */
const FullPageFallback = () => (
  <div className="min-h-screen w-full bg-background p-3 sm:p-4 lg:p-8">
    <div className="max-w-7xl mx-auto w-full">
      <PageSkeleton />
    </div>
  </div>
);

/**
 * Lazy-load a page component. Routes are aggressively prefetched, so the
 * chunk is usually already cached and Suspense never falls back. When it
 * does need to wait, we render a content skeleton (instead of `null` or a
 * white screen) so the layout stays mounted and the user sees a smooth,
 * app-like loading state — never a blank flash.
 */
export function lazyPage<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  const LazyComponent = lazy(factory);
  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={<FullPageFallback />}>
      <LazyComponent {...props} />
    </Suspense>
  );
}
