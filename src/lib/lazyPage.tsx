import { Suspense, lazy, ComponentType } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";

/**
 * Wrap a dynamic import so a stale-chunk failure (e.g. after a redeploy
 * invalidates old hashed filenames) triggers a one-time hard reload instead
 * of crashing the page with "Failed to fetch dynamically imported module".
 */
export function lazyWithRetry<T>(factory: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg)) {
        const KEY = "lovable:chunk-reload";
        if (!sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, "1");
          window.location.reload();
          return new Promise<T>(() => {});
        }
      }
      throw err;
    }
  };
}

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
  const LazyComponent = lazy(lazyWithRetry(factory));
  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={<FullPageFallback />}>
      <LazyComponent {...props} />
    </Suspense>
  );
}
