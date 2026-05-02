import { Suspense, lazy, ComponentType } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";

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
    <Suspense fallback={<PageSkeleton />}>
      <LazyComponent {...props} />
    </Suspense>
  );
}
