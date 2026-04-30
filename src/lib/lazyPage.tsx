import { Suspense, lazy, ComponentType } from "react";

/**
 * Lazy-load a page component. Routes are aggressively prefetched (see
 * routePrefetch.ts), so by the time the user navigates the chunk is usually
 * already in memory and Suspense never has to fall back. We render `null`
 * as the fallback to avoid a layout-less skeleton flash between pages —
 * the previous page stays painted until the new one is ready.
 */
export function lazyPage<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  const LazyComponent = lazy(factory);
  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={null}>
      <LazyComponent {...props} />
    </Suspense>
  );
}
