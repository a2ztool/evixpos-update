import { Suspense, lazy, ComponentType, startTransition } from "react";
import PageSkeleton from "@/components/PageSkeleton";

/**
 * Lazy-load a page component with startTransition for concurrent rendering.
 * Uses a minimal skeleton fallback that renders instantly.
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
